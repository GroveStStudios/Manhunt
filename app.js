/*  Copyright 2012-2016 Sven "underscorediscovery" Bergström

    written by : http://underscorediscovery.ca
    written for : http://buildnewgames.com/real-time-multiplayer/

    MIT Licensed.
    Usage : node app.js
*/

var
  gameport        = process.env.PORT || 4004,

  io              = require('socket.io'),
  express         = require('express'),
  UUID            = require('uuid'),

  verbose         = false,
  http            = require('http'),
  app             = express(),
  server          = http.createServer(app);

/* Express server set up. */

//The express server handles passing our content to the browser,
//As well as routing users where they need to go. This example is bare bones
//and will serve any file the user requests from the root of your web server (where you launch the script from)
//so keep this in mind - this is not a production script but a development teaching tool.

//Tell the server to listen for incoming connections
server.listen(gameport)

  //Log something so we know that it succeeded.
console.log('\t :: Express :: Listening on port ' + gameport );

  //By default, we forward the / path to index.html automatically.
app.get( '/', function( req, res ){
  console.log('trying to load %s', __dirname + '/index.html');
  res.sendFile( '/index.html' , { root:__dirname });
});

//This handler will listen for requests on /*, any file from the root of our server.
//See expressjs documentation for more info on routing.
app.get( '/*' , function( req, res, next ) {
  //This is the current file they have requested
  var file = req.params[0];
  //For debugging, we can track what files are requested.
  if(verbose) console.log('\t :: Express :: file requested : ' + file);
  //Send the requesting client the file.
  res.sendFile( __dirname + '/' + file );
}); //app.get *


/* Socket.IO server set up. */
//Create a socket.io instance using our express server
var sio = io.listen(server);

sio.use(function(socket,next){
  var handshakeData = socket.request;
  //check handshakeData
  next();
});

game_server = require('./server.js');

sio.sockets.on('connection', function (client) {

  client.userid = UUID();
  //tell the player they connected, giving them their id
  console.log("New connection");
  client.emit('onconnected', { id: client.userid } );
  //now we can find them a game to play with someone.
  //if no game exists with someone waiting, they create one and wait.
  game_server.join_game(client);
  //Useful to know when someone connects
  console.log('\t socket.io:: player ' + client.userid + ' connected');

  //Now we want to handle some of the messages that clients will send.
  //They send messages here, and we send them to the game_server to handle.
  client.on('message', function(m) {
    game_server.on_message(client, m);
  });

  //When this client disconnects, we want to tell the game server
  //about that as well, so it can remove them from the game they are
  //in, and make sure the other player knows that they left and so on.
  client.on('disconnect', function () {
    //Useful to know when soomeone disconnects
    console.log('\t socket.io:: client disconnected ' + client.userid + ' ' + client.game_id);
    //If the client was in a game, set by game_server.findGame,
    //we can tell the game server to update that game state.
    if(client.game && client.game.id) {
      game_server.end_game(client.game.id, client.userid);
    }
  });
});
