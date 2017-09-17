"use strict";

const frames = 60/1000;

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
      var currTime = Date.now(), timeToCall = Math.max( 0, frames - ( currTime - lastTime ) );
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
  this.world = {width:1080,height:960};
  this.camera = {width:720,height:480};
  this.teamOneCount = 0;
  this.teamTwoCount = 0;
  this.keyIsPressed = {};

  this.max_speed = 2000.0;
  this.accel_scaling = 1000.0;

  this._pdt = 0.0001;
  this._pdte = new Date().getTime();
  this.local_time = 0.016;
  this._dt = new Date().getTime();
  this._dte = new Date().getTime();

  this.create_timer();

  if(this.server){
    this.players = {
      self: new game_player(this,this.instance.host),
      others: this.instance.clients.map(function(client){
        return new game_player(this,client);
      })
    };
    this.server_time = 0;
    this.laststate = {};
  } else{
    //initialize gl, programs, and buffers
    this.viewport = document.getElementById('viewport');
    this.gl = initGL(this.viewport);
    var prog = makeShaderProgram(this.gl, 'vert', 'frag');
    this.gl.useProgram(prog);
    setResolutionUniform(this.gl, prog);
    this.colorUniform = this.gl.getUniformLocation(prog, "col");
    //uv draw
    var uvBuf = setShaderAttribute(this.gl, prog, "uvcoord");
    drawTile(this.gl,0,0,1/3.71);

    var posBuf = setShaderAttribute(this.gl, prog, "pos");
    //makeTexture(this.gl); (will need to change buffer per player)

    this.players = {
      self: new game_player(this),
      others: [] //other players will be added when they join
    };

    this.create_keyboard();
    this.client_create_configuration();
    //list of recent server updates we interpolate across
    this.server_updates = [];
    this.client_connect_to_server();
    this.client_create_ping_timer();
  }

}

game_core.prototype.create_keyboard = function(){
  document.addEventListener("keydown",function(event){
    this.keyIsPressed[event.key] = true;
  }.bind(this));
  document.addEventListener("keyup",function(event){
    this.keyIsPressed[event.key] = false;
  }.bind(this));
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
  this.socket.on('onserverupdate', this.client_onserverupdate_received.bind(this));
  this.socket.on('onconnected', this.client_onconnected.bind(this));
  //this.socket.on('error', this.client_ondisconnect.bind(this));
  this.socket.on('message', this.client_onnetmessage.bind(this));
};

game_core.prototype.client_onconnected = function(data) {
  this.players.self.id = data.id;
  this.players.self.state = 'connected';
  this.players.self.online = true;
};

game_core.prototype.client_onserverupdate_received = function(data){
  console.log('server update received: '+JSON.stringify(data));
  this.server_time = data.t;
  this.client_time = this.server_time - (this.net_offset/1000);
  this.server_updates.push(data);
  if(this.server_updates.length >= ( 60*this.buffer_size )) {
    this.server_updates.splice(0,1);
  }
  this.oldest_tick = this.server_updates[0].t;
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
        case 'a':  //add new player instance to client list
          this.client_onaddplayer(commanddata); break;
        case 'r' : //ready a game requested
          this.client_onreadygame(commanddata); break;
        case 'e' : //end game requested
          this.client_ondisconnect(commanddata); break;
        case 'p' : //server ping
          this.client_onping(commanddata); break;
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
  var ids = JSON.parse(data);
  for(var i = 0; i < ids.length; i++){
    this.players.others.push(new game_player(this,{userid: ids[i]}));
  }
};

game_core.prototype.client_onaddplayer = function(data) {
  this.players.others.push(new game_player(this, {userid: data}));
}

game_core.prototype.client_onreadygame = function(data) {
  this.local_time = parseFloat(data.replace('-','.')) + this.net_latency;
  console.log('server time is about ' + this.local_time);
};

game_core.prototype.client_onping = function(data) {
  this.net_ping = new Date().getTime() - parseFloat( data );
  this.net_latency = this.net_ping/2;
};

game_core.prototype.handle_server_input = function(client, input, input_time, input_seq) {
  console.log('server handling input of client: ' + client.userid);
  if(client.userid == this.players.self.id){
    console.log('server handle host');
    this.players.self.inputs.push({inputs:input, time:input_time, seq:input_seq});
  } else {
    for(var c=0; c<this.players.others.length; c++){
      if(client.userid == this.players.others[c].id){
        console.log('server handle client ' + (c+1));
        this.players.others[c].inputs.push({inputs:input, time:input_time, seq:input_seq});
      }
    }
  }
};

game_core.prototype.client_handle_input = function() {
  var input = [];
  if(this.keyIsPressed['d'] || this.keyIsPressed['ArrowRight']){
    input.push('r');
  }
  if(this.keyIsPressed['a'] || this.keyIsPressed['ArrowLeft']){
    input.push('l');
  }
  if(this.keyIsPressed['w'] || this.keyIsPressed['ArrowUp']){
    input.push('u');
  }
  if(this.keyIsPressed['s'] || this.keyIsPressed['ArrowDown']){
    input.push('d');
  }
  if(this.keyIsPressed[' ']){
    input.push('s');
  }

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
};

game_core.prototype.process_input = function( player ) {
  var x_dir = 0;
  var y_dir = 0;
  for(var j = 0; j < player.inputs.length; j++) {
    if(player.inputs[j].seq <= player.last_input_seq) {
      continue;
    }
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
        y_dir -= 1;
      }
      if(key == 'u') {
        y_dir += 1;
      }
      if(key == 's') {
        x_dir = 0;
        y_dir = 0;
        player.vel = {x: 0, y: 0}; //TODO test this
        break;
      }
    }
  }
  if(player.inputs.length) {
    player.last_input_time = player.inputs[player.inputs.length-1].time;
    player.last_input_seq = player.inputs[player.inputs.length-1].seq;
  }
  player.inputs = [];
  return {x: x_dir, y:y_dir};
};

game_core.prototype.client_process_net_updates = function(){
  if(!this.server_updates.length) {
    return;
  }
  var current_time = this.client_time;
  var target = null;
  var previous = null;
  for(var i = 0; i < this.server_updates.length-1; i++) {
    var point = this.server_updates[i];
    var next_point = this.server_updates[i+1];
    if(current_time > point.t && current_time < next_point.t) {
      target = next_point;
      previous = point;
      break;
    }
  }
  if(target && previous) {
    this.target_time = target.t;
    var time_point = ((this.target_time - current_time)/(target.t - previous.t)).fixed(3);
    if( isNaN(time_point) || time_point == -Infinity || time_point == Infinity){
      time_point = 0;
    }
    //this.laststate = {sp,cp,sis,cis,t};
    for(var i = 0; i < this.players.others.length; i++){
      if(previous.cp[i]){
        this.players.others[i].pos = this.v_lerp(this.players.others[i].pos,
                                          this.v_lerp(previous.cp[i], target.cp[i], time_point),
                                          this._pdt*this.client_smooth);
      } else if(target.cp[i]){
        this.players.others[i].pos = target.cp[i];
      }
    }
    this.players.self.pos = this.v_lerp(this.players.self.pos,
                                this.v_lerp(previous.sp, target.sp, time_point),
                                this._pdt*this.client_smooth);
  }
}

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

game_core.prototype.checkCollision = function(player, others){ }

game_core.prototype.server_add_player = function(client) {
  this.players.others.push(new game_player(this, client));
}

game_core.prototype.update = function(t){
  this.dt = this.lastframetime ? ( (t - this.lastframetime)/1000.0).fixed() : 0.016;
  this.lastframetime = t;
  this._pdt = (new Date().getTime() - this._pdte)/1000.0;
  this._pdte = new Date().getTime();

  if(this.server){
    //update player physics
    this.players.self.accel = this.process_input(this.players.self);
    this.players.self.update_player_physics(this.dt);
    for(var i=0; i<this.players.others.length; i++) {
      this.players.others[i].accel = this.process_input(this.players.others[i]);
      this.players.others[i].update_player_physics(this.dt);
    }
    //check collisions

    //emit server states
    this.server_time = this.local_time;
    this.laststate = {
      sp  : this.players.self.pos,                //'self position', the game creators position
      cp  : this.players.others.map(function(p){ return p.pos; }),
                                                  //'clients position', the person that joined, their position
      sis : this.players.self.last_input_seq,     //'self input sequence', the last input we processed for the host
      cis : this.players.others.map(function(p){ return p.last_input_seq; }),
                                                  //'client input sequence', the last inputs we processed for the client
      t   : this.server_time                      // our current local time on the server
    };
    if(this.players.self.instance) {
      console.log('server update sent to host');
      console.log(this.laststate);
      this.players.self.instance.emit('onserverupdate', this.laststate);
    }
    if(this.players.others.length){
      for(var i=0; i<this.players.others.length; i++) {
        var laststate = {
          sp : this.players.others[i].pos,
          cp : [this.players.self.pos],
          sis : this.players.others[i].last_input_seq,
          cis : [this.players.self.last_input_seq],
          t: this.server_time
        }
        for(var j = 0; j < this.players.others.length; j++){
          if(j != i){
            laststate.cp.push(this.players.others[j].pos);
            laststate.cis.push(this.players.others[j].last_input_seq);
          }
        }
        console.log('server update to client '+i);
        console.log(laststate);
        this.players.others[i].instance.emit( 'onserverupdate', laststate );
      }
    }
  } else{
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.client_handle_input();
    this.client_process_net_updates();

    //draw players
    console.log('self');
    this.draw(this.players.self);
    console.log('others');
    for(var i = 0; i < this.players.others.length; i++){
      //if(on camera){
      this.draw(this.players.others[i]);
      //}
    }
  }
  //schedule next update
  this.updateid = window.requestAnimationFrame( this.update.bind(this), this.viewport );
}

game_core.prototype.draw = function(item){
  /*if(this.team == 0){
    this.game.gl.uniform3f(this.game.colorUniform, .351, .613, 1);
  } else {
    this.game.gl.uniform3f(this.game.colorUniform, .703, 1, 1);
  }*/
  //drawTile(this.gl, item.pos.x - this.camera.x, item.pos.y - this.camera.y, item.size);
  console.log(item);
  drawTile(this.gl, item.pos.x, item.pos.y, item.size);
  this.gl.drawArrays(this.gl.TRIANGLES,0,42); //3*14=42
}

//player class constructor
var game_player = function(game_instance, player_instance){
  this.instance = player_instance;
  this.game = game_instance;
  if(player_instance) {
    console.log('game_player constructor: '+player_instance.userid);
    this.id = player_instance.userid;
  }
  //this.team = ?

  this.inputs = [];

  //should check for player collision first
  /*this.pos = {
      x:(Math.random()*game_instance.camera.width).fixed(3),
      y:(Math.random()*game_instance.camera.height).fixed(3)
    };*/
  this.pos = {x:30, y:30};
  this.accel = {x:0, y:0};
  this.vel = {x:0, y:0};

  this.max_speed = this.game.max_speed;
  this.accel_scaling = this.game.accel_scaling;

  this.speed2 = 0; //square of player speed

  this.color = 'rgba(255,255,255,1)';
  this.size = 5;
  //other things the player has
};

game_player.prototype.update_player_physics = function(dt){
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

function initGL(canvas){
  var gl = canvas.getContext("webgl");
  if(!gl) {
    return;
  }
  gl.viewport(0,0,gl.canvas.width,gl.canvas.height);
  gl.clearColor(0,0,0,1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  return gl;
}

function createShader(gl, type, source){
  var shader = gl.createShader(type);
  gl.shaderSource(shader,source);
  gl.compileShader(shader);
  var success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if(success){
    return shader;
  }
  console.log(gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
}

function createProgram(gl, vert, frag){
  var program = gl.createProgram();
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  var success = gl.getProgramParameter(program, gl.LINK_STATUS);
  if(success){
    return program;
  }
  console.log(gl.getProgramInfoLog(program));
  gl.deleteProgram(program);
}

function makeShaderProgram(gl, vert_id, frag_id){
  var vsrc = document.getElementById(vert_id).text;
  var fsrc = document.getElementById(frag_id).text;
  var vert = createShader(gl, gl.VERTEX_SHADER, vsrc);
  var frag = createShader(gl, gl.FRAGMENT_SHADER, fsrc);
  return createProgram(gl, vert, frag);
}

function setShaderAttribute(gl, program, shadervar){
  var loc = gl.getAttribLocation(program, shadervar);
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  return buf;
}

function setResolutionUniform(gl, program){
  var loc = gl.getUniformLocation(program, "ures");
  gl.uniform2f(loc, gl.canvas.width, gl.canvas.height);
}

function makeTexture(gl){
  var texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  return texture;
}
