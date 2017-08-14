"use strict";

var frames = 60/1000;

//not sure what this does yet
( function () {
    var lastTime = 0;
    var vendors = [ 'ms', 'moz', 'webkit', 'o' ];
    for ( var x = 0; x < vendors.length && !window.requestAnimationFrame; ++ x ) {
        window.requestAnimationFrame = window[ vendors[ x ] + 'RequestAnimationFrame' ];
        window.cancelAnimationFrame = window[ vendors[ x ] + 'CancelAnimationFrame' ] || window[ vendors[ x ] + 'CancelRequestAnimationFrame' ];
    }
    if ( !window.requestAnimationFrame ) {
        window.requestAnimationFrame = function ( callback, element ) {
            var currTime = Date.now(), timeToCall = Math.max( 0, frame_time - ( currTime - lastTime ) );
            var id = window.setTimeout( function() { callback( currTime + timeToCall ); }, timeToCall );
            lastTime = currTime + timeToCall;
            return id;
        };
    }
    if ( !window.cancelAnimationFrame ) {
        window.cancelAnimationFrame = function ( id ) { clearTimeout( id ); };
    }
}() );

//game instance constructor
var game_core = function(game_instance){
  this.instance = game_instance;
  this.server = this.instance !== undefined;
  this.world = game_instance.world;
  this.camera = game_instance.camera;
  this.teamOneCount = 0;
  this.teamTwoCount = 0;

  if(this.server){
    this.players = {
      self: new game_player(this,this.instance.host),
      others: this.instance.clients.map(function(client){
        return new game_player(this,client);
      });
    };
  } else{
    this.players = {
      self: new game_player(this),
      others: [new game_player(this.instance.host)].concat(this.instance.clients) //how to avoid self being put in others?
    };
    this.ghosts = {
      serverPosSelf : new game_player(this),
      serverPosOthers : [],
      posOthers: []
    }
    this.ghosts.pos_other.state = 'dest_pos';
    this.ghosts.server_pos_self.state = 'server_pos';
    this.ghosts.server_pos_other.state = 'server_pos';
    this.ghosts.server_pos_self.pos = { x:20, y:20 };

    this.server_updates = [];
  }

  this.max_speed = 4.0;
  this.accel_scaling = 0.07;

  this._pdt = 0.0001;
  this._pdte = new Date().getTime();
  this.local_time = 0.016;
  this._dt = new Date().getTime();
  this._dte = new Date().getTime();

  this.create_keyboard();
  this.createTimer();
  //Client specific initialisation
  if(!this.server) {
    this.client_create_configuration();
    //list of recent server updates we interpolate across
    this.server_updates = [];
    this.client_connect_to_server();
    this.client_create_ping_timer();
  } else { //if server
    this.server_time = 0;
    this.laststate = {};
  }
}

game_core.prototype.create_keyboard = function(){
  //set up keyboard listeners
  document.addEventListener("keydown",function(event){
    this.keyIsPressed[event.keyCode] = true;
  });
  document.addEventListener("keyup",function(event){
    this.keyIsPressed[event.keyCode] = false;
  });
}

game_core.prototype.create_timer = function(){
  setInterval(function(){
    this._dt = new Date().getTime() - this._dte;
    this._dte = new Date().getTime();
    this.local_time += this._dt/1000.0;
  }.bind(this), 4);
};

game_core.prototype.client_create_configuration = function() {
  this.input_seq = 0;                 //When predicting client inputs, we store the last input as a sequence number
  this.client_smoothing = true;       //Whether or not the client side prediction tries to smooth things out
  this.client_smooth = 25;            //amount of smoothing to apply to client update dest

  this.net_latency = 0.001;           //the latency between the client and the server (ping/2)
  this.net_ping = 0.001;              //The round trip time from here to the server,and back
  this.last_ping_time = 0.001;        //The time we last sent a ping

  this.net_offset = 100;              //100 ms latency between server and client interpolation for other clients
  this.buffer_size = 2;               //The size of the server history to keep for rewinding/interpolating.
  this.target_time = 0.01;            //the time where we want to be in the server timeline
  this.oldest_tick = 0.01;            //the last time tick we have available in the buffer

  this.client_time = 0.01;            //Our local 'clock' based on server time - client interpolation(net_offset).
  this.server_time = 0.01;            //The time the server reported it was at, last we heard from it

  this.dt = 0.016;                    //The time that the last frame took to run
  this.fps = 0;                       //The current instantaneous fps (1/this.dt)
  this.fps_avg_count = 0;             //The number of samples we have taken for fps_avg
  this.fps_avg = 0;                   //The current average fps displayed in the debug UI
  this.fps_avg_acc = 0;               //The accumulation of the last avgcount fps samples

  this.lit = 0;
  this.llt = new Date().getTime();
};

game_core.prototype.client_connect_to_server = function() {
  this.socket = io.connect();
  this.socket.on('connect', function(){
      this.players.self.state = 'connecting';
  }.bind(this));
  //this.socket.on('disconnect', this.client_ondisconnect.bind(this));
  this.socket.on('onserverupdate', this.client_onserverupdate_recieved.bind(this));
  this.socket.on('onconnected', this.client_onconnected.bind(this));
  //this.socket.on('error', this.client_ondisconnect.bind(this));
  this.socket.on('message', this.client_onnetmessage.bind(this));
};

game_core.prototype.client_onconnected = function(data) {
  this.players.self.id = data.id;
  this.players.self.state = 'connected';
  this.players.self.online = true;
};

game_core.prototype.client_onserverupdate_recieved = function(data){
  var player_host = this.instance.host;
  var player_clients = this.instance.clients;
  //Store server time
  this.server_time = data.t;
  //Update our local offset time from the last server update
  this.client_time = this.server_time - (this.net_offset/1000);
  //Cache the data from the server
  this.server_updates.push(data);
  //we limit the buffer in seconds worth of updates
  if(this.server_updates.length >= ( 60*this.buffer_size )) {
    this.server_updates.splice(0,1);
  }
  this.oldest_tick = this.server_updates[0].t;
  this.client_process_net_prediction_correction();
};

game_core.prototype.client_onnetmessage = function(data) {
  var commands = data.split('.');
  var command = commands[0];
  var subcommand = commands[1] || null;
  var commanddata = commands[2] || null;
  switch(command) {
    case 's': //server message
      switch(subcommand) {
        case 'h' : //host a game requested
          this.client_onhostgame(commanddata); break;
        case 'j' : //join a game requested
          this.client_onjoingame(commanddata); break;
        case 'r' : //ready a game requested
          this.client_onreadygame(commanddata); break;
        case 'e' : //end game requested
          this.client_ondisconnect(commanddata); break;
        case 'p' : //server ping
          this.client_onping(commanddata); break;
        case 'c' : //other player changed colors
          this.client_on_otherclientcolorchange(commanddata); break;
      }
    break;
  }
};

game_core.prototype.client_onhostgame = function(data) {
  var server_time = parseFloat(data.replace('-','.'));
  //Get an estimate of the current time on the server
  this.local_time = server_time + this.net_latency;
  this.players.self.host = true;
  this.players.self.state = 'hosting.waiting for a player';
};

game_core.prototype.client_onjoingame = function(data) {
    this.players.self.host = false;
    this.players.self.state = 'connected.joined.waiting';
};

game_core.prototype.client_onreadygame = function(data) {
  var server_time = parseFloat(data.replace('-','.'));
  this.local_time = server_time + this.net_latency;
  console.log('server time is about ' + this.local_time);
};

game_core.prototype.handle_server_input = function(client, input, input_time, input_seq) {
  if(client.userid == this.players.self.instance.userid){
    var player_client = this.players.self;
  } else {
    for(client in this.players.others){
      if(client.userid == client.instance.userid){
        var player_client = this.players.self;
      }
    }
  }
  player_client.inputs.push({inputs:input, time:input_time, seq:input_seq});
};

game_core.prototype.client_handle_input(){
  var input_x = 0;
  var input_y = 0;
  var input = [];
  if(this.keyIsPressed[68] || this.keyIsPressed[39]){ // d or RIGHT
    input_x++;
    input.push('r');
  }
  if(this.keyIsPressed[65] || this.keyIsPressed[37]){
    input_x--;
    input.push('l');
  }
  if(this.keyIsPressed[87] || this.keyIsPressed[38]){ // w or UP
    input_y++;
    this.input.push('u');
  }
  if(this.keyIsPressed[83] || this.keyIsPressed[40]){ // s or DOWN
    input_y--;
    this.input.push('d');
  }
  if(this.keyIsPressed==32) { //space (stop)
    game.players.self.vel.x = 0;
    game.players.self.vel.y = 0;
    input_x = 0;
    input_y = 0;
    this.input.push('s');
  }
  game.players.self.accel.x = input_x;
  game.players.self.accel.y = input_y;

  if(input.length){
    this.input_seq++;
    this.players.self.inputs.push({
      inputs: input,
      time: this.local_time.fixed(3),
      seq: this.input_seq
    });
  }
  var server_packet = 'i.' + input.join('-') + '.'
    + this.local_time.toFixed(3).replace('.','-')
    + '.' + this.input_seq;
  this.socket.send(server_packet);
}

game_core.prototype.process_input = function( player ) {
  var x_dir = 0;
  var y_dir = 0;
    for(var j = 0; j < player.inputs.length; ++j) {
      if(player.inputs[j].seq <= player.last_input_seq) continue;
      var input = player.inputs[j].inputs;
      for(var i = 0; i < input.length; ++i) {
        var key = input[i];
        if(key == 'l') {
          x_dir -= 1;
        }
        if(key == 'r') {
          x_dir += 1;
        }
        if(key == 'd') {
          y_dir += 1;
        }
        if(key == 'u') {
          y_dir -= 1;
        }
        if(key == 's') {
          x_dir = 0;
          y_dir = 0;
          break;
        }
      }
    }
  }
  if(player.inputs.length) {
    player.last_input_time = player.inputs[player.inputs.length-1].time;
    player.last_input_seq = player.inputs[player.inputs.length-1].seq;
  }
};

//Set a ping timer to 1 second, to maintain the ping/latency between
//client and server and calculated roughly how our connection is doing
game_core.prototype.client_create_ping_timer = function() {
  setInterval(function(){
    this.last_ping_time = new Date().getTime() - this.fake_lag;
    this.socket.send('p.' + (this.last_ping_time) );
  }.bind(this), 1000);
};

if('undefined' != typeof global){
  module.exports = global.game_core = game_core;
}

//resolve float to n decimal digits
Number.prototype.fixed = function(n) { n = n || 3; return parseFloat(this.toFixed(n)); };
//For the server, we need to cancel the setTimeout that the polyfill creates
game_core.prototype.stop_update = function() {  window.cancelAnimationFrame( this.updateid );  };
game_core.prototype.lerp = function(p, n, t) { var _t = Number(t); _t = (Math.max(0, Math.min(1, _t))).fixed(); return (p + _t * (n - p)).fixed(); };
game_core.prototype.v_lerp = function(v,tv,t) { return { x: this.lerp(v.x, tv.x, t), y:this.lerp(v.y, tv.y, t) }; };

game_core.prototype.checkCollision = function(item, others){ }

game_core.prototype.update = function(t){
  this.dt = this.lastframetime ? ( (t - this.lastframetime)/1000.0).fixed() : 0.016;
  this.lastframetime = t;
  this.gl.clear(gl.COLOR_BUFFER_BIT);

  if(this.server){
    this.server_time = this.local_time;
    this.laststate = {
      hp  : this.players.self.pos,                //'host position', the game creators position
      cp  : this.players.other.pos,               //'client position', the person that joined, their position
      his : this.players.self.last_input_seq,     //'host input sequence', the last input we processed for the host
      cis : this.players.others.map(function(p){ return p.last_input_seq; }),
                                                  //'client input sequence', the last inputs we processed for the client
      t   : this.server_time                      // our current local time on the server
    };
    if(this.players.self.instance) {
      this.players.self.instance.emit( 'onserverupdate', this.laststate );
    }
    for(player in this.players.others) {
      player.instance.emit( 'onserverupdate', this.laststate );
    }
  } else{
    this.client_handle_input();
  }

  this.players.self.updatePlayer(this.dt);
  //<----needs the interpolation stuff and the updates etc etc
  for(player in this.players.others){
    player.updatePlayer(this.dt);
  }

  //schedule next update
  this.updateid = window.requestAnimationFrame( this.update.bind(this), this.viewport );
}

//player class constructor
var game_player = function(game_instance, player_instance){
  this.instance = player_instance;
  this.game = game_instance;
  //this.team = ?

  //should check for player collision first
  this.pos = {x:Math.random()*game_instance.world.width, y:Math.random()*game_instance.world.height};
  this.accel = {x:0, y:0};
  this.vel = {x:0, y:0};

  this.max_speed = this.game.max_speed;
  this.accel_scaling = this.game.accel_scaling;

  this.speed2 = 0; //square of player speed

  this.color = 'rgba(255,255,255,1)';
  this.size = 3;
  //other things the player has
};

game_player.prototype.updatePlayer = function(dt){
  this.vel.x += this.accel.x*this.accel_scaling*dt;
  this.vel.y += this.accel.y*this.accel_scaling*dt;
  this.speed2 = this.vel.x*this.vel.x + this.vel.y*this.vel.y;
  if(this.speed2 > this.max_speed){
    this.vel.x *= this.max_speed / this.speed2;
    this.vel.y *= this.max_speed / this.speed2;
    this.speed2 = this.max_speed;
  }
  this.pos.x += this.vel.x*dt;
  this.pos.y += this.vel.y*dt;

  if(this.team == 0){
    this.game.gl.uniform3f(this.game.colorUniform, .351, .613, 1);
  } else {
    this.game.gl.uniform3f(this.game.colorUniform, .703, 1, 1);
  }
  this.draw(); //only do if within camera range of self
}

game_player.prototype.draw = function(){
  drawTile(this.game.gl,this.pos.x,this.pos.y,this.size);
  this.game.gl.drawArrays(this.game.gl.TRIANGLES,0,42); //3*14=42
}

//draw octogonal tile from bottom-left anchor point
/* ----------------
 * -----10___11----
 * ----/------\----
 * ---6--7--8--9---
 * ---|--------|---
 * ---2--3--4--5---
 * ----\------/----
 * -----0___1------
 * ----------------
 */
function drawTile(gl,x,y,size){
  //map from vertex no. to distance from anchor in x/y dir
  var w = [1,2.71,0,1,2.71,3.71,0,1,2.71,3.71,1,2.71].map(function(x){ return x*size; });
  var h = [0,0,1,1,1,1,2.71,2.71,2.71,2.71,3.71,3.71].map(function(x){ return x*size; });
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    x+w[0], y+h[0], x+w[2],
    y+h[2], x+w[3], y+h[3],
    x+w[0], y+h[0], x+w[3],
    y+h[3], x+w[4], y+h[4],
    x+w[0], y+h[0], x+w[4],
    y+h[4], x+w[1], y+h[1],
    x+w[1], y+h[1], x+w[4],
    y+h[4], x+w[5], y+h[5],
    x+w[2], y+h[2], x+w[6],
    y+h[6], x+w[7], y+h[7],
    x+w[2], y+h[2], x+w[7],
    y+h[7], x+w[3], y+h[3],
    x+w[3], y+h[3], x+w[7],
    y+h[7], x+w[8], y+h[8],
    x+w[3], y+h[3], x+w[8],
    y+h[8], x+w[4], y+h[4],
    x+w[4], y+h[4], x+w[8],
    y+h[8], x+w[9], y+h[9],
    x+w[4], y+h[4], x+w[9],
    y+h[9], x+w[5], y+h[5],
    x+w[6], y+h[6], x+w[10],
    y+h[10], x+w[7], y+h[7],
    x+w[7], y+h[7], x+w[10],
    y+h[10], x+w[11], y+h[11],
    x+w[7], y+h[7], x+w[11],
    y+h[11], x+w[8], y+h[8],
    x+w[8], y+h[8], x+w[11],
    y+h[11], x+w[9], y+h[9]]),
    gl.STATIC_DRAW);
}
