var gameServer = module.exports = { games : {}, gameCount: 0},
 UUID = require('node-uuid'),
 verbose = true;

global.window = global.document = global;
require('./manhunt.js');

gameServer.log = function(){
  if(verbose) console.log.apply(this,arguments);
};

gameServer.fakeLatency = 0;
gameServer.localTime = 0;
gameServer._dt = new Date().getTime();
gameServer._dte = new Date().getTime();

game_server.messages = [];

setInterval(function(){
  gameServer._dt = new Date().getTime() - gameServer._dte;
  gameServer.dte = new Date().getTime();
  gameServer.localTime += gameServer._dt/1000;
}, 4);

gameServer.createGame = function(player) {
  var game = {
    id : UUID(),
    host:player,
    clients:[],
    playerCount:1
  };

  this.games[game.id] = thegame;
  this.gameCount++;

  game.gameCore = new gameCore(game);
  game.gameCore.update(new Date().getTime());

  player.send('s.h.'+String(game.gameCore.localTime).replace('.','-'));
  console.log('server host at '+ game.gameCore.localTime);

  player.game = game;
  player.hosting = true;

  this.log('player '+player.userid+' created a game with id '+player.game.id);

  return game;
}

gameServer.startGame = function(game){
  game.clients[0].send('s.j.' + game.host.userid);
  game.clients[0].game = game;

  game.clients[0].send('s.r.'+String(game.gameCore.localTime).replace('.','-'));
  game.host.send('s.r.'+String(game.gameCore.localTime).replace('.','-'));

  game.active = true;
}

gameServer.joinGame = function(player) {
  this.log('looking for a game. we have '+this.gameCount+' games');

  if(this.gameCount) {
    var joinedGame = false;

    for(var gameid in this.games){
      if(!this.games.hasOwnProperty(gameid)) continue;

      var gameInstance = this.games[gameid];

      if(gameInstance.playerCount < 10){
        joinedGame = true;
        gameInstance.clients..push(player);
        gameInstance.gameCore.players.others.push = player;
        gameInstance.playerCount++;
        //start game appropriately
      }
    }

    if(!joinedGame){
      this.createGame(player);
    }
  } else {
    this.createGame(player);
  }
};
