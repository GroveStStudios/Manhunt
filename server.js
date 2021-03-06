var game_server = module.exports = { games : {}, game_count: 0},
 UUID = require('node-uuid'),
 verbose = true;

global.window = global.document = global;
require('./manhunt.js');

game_server.log = function(){
  if(verbose) console.log.apply(this,arguments);
};

game_server.fake_latency = 0;
game_server.local_time = 0;
game_server._dt = new Date().getTime();
game_server._dte = new Date().getTime();

game_server.messages = [];

setInterval(function(){
  game_server._dt = new Date().getTime() - game_server._dte;
  game_server._dte = new Date().getTime();
  game_server.local_time += game_server._dt/1000;
}, 4);

game_server.create_game = function(player) {
  var game = {
    id : UUID(),
    host:player,
    clients:[],
    world:{width:1080,height:960},
    camera:{width:720,height:480},
    player_count:1
  };

  this.games[game.id] = thegame;
  this.game_count++;

  game.game_core = new game_core(game);
  game.game_core.update(new Date().getTime());

  player.send('s.h.'+String(game.game_core.local_time).replace('.','-'));
  console.log('server host at '+ game.game_core.local_time);

  player.game = game;
  player.hosting = true;

  this.log('player '+player.userid+' created a game with id '+player.game.id);

  return game;
}

game_server.start_game = function(game){
  for(client in game.clients){
    client.send('s.j.' + game.host.userid);
    client.game = game;
    client.send('s.r.'+String(game.game_core.local_time).replace('.','-'));
  }
  game.host.send('s.r.'+String(game.game_core.local_time).replace('.','-'));
  game.active = true;
}

game_server.join_game = function(player) {
  this.log('looking for a game. we have '+this.game_count+' games');
  if(this.game_count) {
    var joined_game = false;
    for(var gameid in this.games){
      if(!this.games.hasOwnProperty(gameid)) continue;
      var game_instance = this.games[gameid];
      if(game_instance.player_count < 10){
        joined_game = true;
        game_instance.clients.push(player);
        game_instance.game_core.players.others.push = player;
        //also tell other players to add player
        game_instance.player_count++;
        //start game appropriately
      }
    }
    if(!joined_game){
      this.create_game(player);
    }
  } else {
    this.create_game(player);
  }
};

game_server.end_game = function(gameid, userid) {
  var thegame = this.games[gameid];
  if(thegame) {
    thegame.gamecore.stop_update();
    if(thegame.player_count > 1) {
      if(userid == thegame.player_host.userid) {
        if(thegame.player_client) {
          thegame.player_client.send('s.e'); //EITHER DO FOR ALL CLIENTS OR IGNORE
          this.find_game(thegame.player_client);
        }
      } else {
        if(thegame.player_host) {
          thegame.player_host.send('s.e');
          thegame.player_host.hosting = false;
          this.find_game(thegame.player_host);
        }
      }
    }
    delete this.games[gameid];
    this.game_count--;
    this.log('game removed. there are now ' + this.game_count + ' games' );
  } else {
      this.log('that game was not found!');
  }
};

game_server.onInput = function(client, parts) {
  var input_commands = parts[1].split('-');
  var input_time = parts[2].replace('-','.');
  var input_seq = parts[3];
  if(client && client.game && client.game.gamecore) {
    client.game.gamecore.handle_server_input(client, input_commands, input_time, input_seq);
  }
};

game_server.onMessage = function(client,message) {
  var message_parts = message.split('.');
  var message_type = message_parts[0];
  if(message_type == 'i') {
     this.onInput(client, message_parts);
  } else if(message_type == 'p') {
     client.send('s.p.' + message_parts[1]);
  }
};
