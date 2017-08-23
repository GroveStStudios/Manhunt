var game_server = module.exports = { games : {}, game_count: 0},
 UUID = require('uuid'),
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
    player_count:1
  };

  this.games[game.id] = game;
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
  console.log("game "+game.id+" has begun");
  game.host.send('s.r.'+String(game.game_core.local_time).replace('.','-'));
  for(var i=0; i<game.clients.length; i++){
    game.clients[i].game = game;
    game.clients[i].send('s.r.'+String(game.game_core.local_time).replace('.','-'));
  }
  game.active = true;
}

game_server.join_game = function(player) {
  this.log('looking for a game. we have '+this.game_count+' games');
  if(this.game_count) {
    var joined_game = false;
    for(var gameid in this.games){
      if(!this.games.hasOwnProperty(gameid)) continue;
      var game = this.games[gameid];
      if(game.player_count < 10){
        //send the player the IDs of all the other players
        player.send('s.j.' + JSON.stringify([game.host.userid].concat(game.clients.map(function(c){ return c.userid; }))));
        joined_game = true;
        game.host.send('s.a.' + player.userid);
        for(var i=0; i<game.player_count-1; i++) {
          game.clients[i].send('s.a.' + player.userid);
        }
        game.clients.push(player);
        game.game_core.server_add_player(player);
        game.player_count++;
        if(!this.games[gameid].active){
          this.start_game(this.games[gameid]);
        } else {
          player.game = game;
          player.send('s.r.'+String(game.game_core.local_time).replace('.','-'));
        }
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
  var game = this.games[gameid];
  if(game) {
    game.game_core.stop_update();
    if(game.player_count > 1) {
      if(userid == game.host.userid) {
        for(var i=0; i<game.clients.lenth; i++) {
          game.clients[i].send('s.e'); //EITHER DO FOR ALL CLIENTS OR IGNORE
          this.join_game(game.clients[i]);
        }
      } else {
        if(game.host) {
          game.host.send('s.e');
          game.host.hosting = false;
          this.join_game(game.host);
        }
        //send to other clients and get new host
      }
    } else {
      delete this.games[gameid];
      this.game_count--;
      this.log('game removed. there are now ' + this.game_count + ' games' );
    }
  } else {
    this.log('that game was not found!');
  }
};

game_server.on_input = function(client, parts) {
  var input_commands = parts[1].split('-');
  var input_time = parts[2].replace('-','.');
  var input_seq = parts[3];
  if(client && client.game && client.game.game_core) {
    client.game.game_core.handle_server_input(client, input_commands, input_time, input_seq);
  }
};

game_server.on_message = function(client,message) {
  console.log(JSON.stringify(message));
  var message_parts = message.split('.');
  var message_type = message_parts[0];
  if(message_type == 'i') {
    this.on_input(client, message_parts);
  } else if(message_type == 'p') {
    client.send('s.p.' + message_parts[1]);
  }
};
