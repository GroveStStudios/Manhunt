"use strict";

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

$(document).keydown(function(event){
  if(event.which==87 || event.which==38) { //UP
    playerAccel.y += 1;
  }
  if(event.which==68 || event.which==39) { //RIGHT
    playerAccel.x += 1;
  }
  if(event.which==83 || event.which==40) { //DOWN
    playerAccel.y -= 1;
  }
  if(event.which==65 || event.which==37) { //LEFT
    playerAccel.x -= 1;
  }
  if(event.which==69) { //e
    playerVel.x = 0;
    playerVel.y = 0;
  }
  if(event.which==32) { //SPACE
  }
  if(playerAccel.x != 0) { playerAccel.x /= Math.abs(playerAccel.x) };
  if(playerAccel.y != 0) { playerAccel.y /= Math.abs(playerAccel.y) };
  console.log(event.which);
});

$(document).keyup(function(event){
  if(event.which==87 || event.which==38) { //UP
    playerAccel.y -= 1;
  }
  if(event.which==68 || event.which==39) { //RIGHT
    playerAccel.x -= 1;
  }
  if(event.which==83 || event.which==40) { //DOWN
    playerAccel.y += 1;
  }
  if(event.which==65 || event.which==37) { //LEFT
    playerAccel.x +=1 ;
  }
});

function main(){
  //initialize
  var canv = document.getElementById("canv");
  var gl = initGL(canv);
  var prog = makeShaderProgram(gl, 'vert', 'frag');

  //begin render program
  gl.useProgram(prog);

  //shader uniforms
  setResolutionUniform(gl, prog);
  var colUnifLoc = gl.getUniformLocation(prog, "col");

  //shader attributes
  var uvBuf = setShaderAttribute(gl, prog, "uvcoord");
  draw(gl,0,0,1/3.71); //draw tile UVs, this is the same for all tiles
  var posBuf = setShaderAttribute(gl, prog, "pos");

  //create / bind texture
  //makeTexture(gl);
  gl.uniform3f(colUnifLoc, 1, 1, 1);

  playerPos.x = canv.width/2;
  playerPos.y = canv.height/2;

  //init main loop
  upgdateGame(gl, canv, colUnifLoc);
}

function updateGame(gl, canv, colLoc){
  updateInfo();
  gl.clear(gl.COLOR_BUFFER_BIT);
  playerVel.x += playerAccel.x*accelScaling;
  playerVel.y += playerAccel.y*accelScaling;
  playerSpeed = playerVel.x*playerVel.x + playerVel.y*playerVel.y;
  if(playerSpeed > maxSpeed){
    playerVel.x *= maxSpeed / playerSpeed;
    playerVel.y *= maxSpeed / playerSpeed;
    playerSpeed = maxSpeed;
  }
  playerPos.x += playerVel.x;
  playerPos.y += playerVel.y;
  drawTile(gl,playerPos.x,playerPos.y,5);
  gl.drawArrays(gl.TRIANGLES,0,42); //3*14=42
  window.setTimeout(gameLoop, 16, gl, canv, colLoc);
}

function updateInfo(){
  $("#pos").text("Pos: ("+playerPos.x+","+playerPos.y+")");
  $("#veloc").text("Vel: ("+playerVel.x+","+playerVel.y+")");
  $("#accel").text("Accel: ("+playerAccel.x+","+playerAccel.y+")");
  $("#speed").text("Speed: "+playerSpeed);
}

//game instance constructor
var gameCore = function(gameInstance){
  this.instance = gameInstance;
  this.server = this.instance !== undefined;

  this.world = {
    width : 720,
    height: 480
  }

  if(this.server){
    this.players = {
      self: new gamePlayer(this,this.instance.host),
      others: this.instance.clients.map(function(client){
        return new gamePlayer(this,client);
      });
    };
    this.players.self.pos = {x:20,y:20};
  } else{
    this.players = {
      self: new gamePlayer(this),
      others: []
    };
    this.ghosts = {
      serverPosSelf : new gamePlayer(this),
      serverPosOthers : [],
      posOthers: []
    }

    this.ghosts.posOther.state = 'dest_pos';

    this.ghosts.serverPosSelf.state = 'server_pos';
    this.ghosts.serverPosOther.state = 'server_pos';

    this.ghosts.serverPosSelf.pos = { x:20, y:20 };

    this.serverUpdates = [];

  }

  this.playerspeed = 120;

  this._pdt = 0.0001;
  this._pdte = new Date().getTime();
  this.local_time = 0.016;
  this._dt = new Date().getTime();
  this._dte = new Date().getTime();

  this.createPhysicsSimulation();
  this.createTimer();

}

if('undefined' != typeof global){
  module.exports = global.gameCore = gameCore;
}

Number.prototype.fixed = function(n) { n = n || 3; return parseFloat(this.toFixed(n)); };
    //copies a 2d vector like object from one to another
gameCore.prototype.pos = function(a) { return {x:a.x,y:a.y}; };
    //Add a 2d vector with another one and return the resulting vector
gameCore.prototype.v_add = function(a,b) { return { x:(a.x+b.x).fixed(), y:(a.y+b.y).fixed() }; };
    //Subtract a 2d vector with another one and return the resulting vector
gameCore.prototype.v_sub = function(a,b) { return { x:(a.x-b.x).fixed(),y:(a.y-b.y).fixed() }; };
    //Multiply a 2d vector with a scalar value and return the resulting vector
gameCore.prototype.v_mul_scalar = function(a,b) { return {x: (a.x*b).fixed() , y:(a.y*b).fixed() }; };
    //For the server, we need to cancel the setTimeout that the polyfill creates
gameCore.prototype.stop_update = function() {  window.cancelAnimationFrame( this.updateid );  };
    //Simple linear interpolation
gameCore.prototype.lerp = function(p, n, t) { var _t = Number(t); _t = (Math.max(0, Math.min(1, _t))).fixed(); return (p + _t * (n - p)).fixed(); };
    //Simple linear interpolation between 2 vectors
gameCore.prototype.v_lerp = function(v,tv,t) { return { x: this.lerp(v.x, tv.x, t), y:this.lerp(v.y, tv.y, t) }; };

gameCore.prototype.update = function(t) {
        //Work out the delta time
    this.dt = this.lastframetime ? ( (t - this.lastframetime)/1000.0).fixed() : 0.016;

        //Store the last frame time
    this.lastframetime = t;

        //Update the game specifics
    if(!this.server) {
        this.client_update();
    } else {
        this.server_update();
    }
        //schedule the next update
    this.updateid = window.requestAnimationFrame( this.update.bind(this), this.viewport );
}; //game_core.update


//player class constructor
var gamePlayer = function(gameInstance, playerInstance){
  this.instance = playerInstance;
  this.game = gameInstance;

  this.pos = {x:0, y:0};
  this.accel = {x:0, y:0};
  this.vel = {x:0, y:0};
  this.speed = 0; //square of player speed

  this.color = 'rgba(255,255,255,1)';
  this.size = 3;
  //other things the player has

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
  this.draw = function(gl){
    function mult(x){
      return x*this.size;
    }
    //map from vertex no. to distance from anchor in x/y dir
    var w = [1,2.71,0,1,2.71,3.71,0,1,2.71,3.71,1,2.71].map(mult);
    var h = [0,0,1,1,1,1,2.71,2.71,2.71,2.71,3.71,3.71].map(mult);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      this.pos.x+w[0], this.pos.y+h[0], this.pos.x+w[2],
      this.pos.y+h[2], this.pos.x+w[3], this.pos.y+h[3],
      this.pos.x+w[0], this.pos.y+h[0], this.pos.x+w[3],
      this.pos.y+h[3], this.pos.x+w[4], this.pos.y+h[4],
      this.pos.x+w[0], this.pos.y+h[0], this.pos.x+w[4],
      this.pos.y+h[4], this.pos.x+w[1], this.pos.y+h[1],
      this.pos.x+w[1], this.pos.y+h[1], this.pos.x+w[4],
      this.pos.y+h[4], this.pos.x+w[5], this.pos.y+h[5],
      this.pos.x+w[2], this.pos.y+h[2], this.pos.x+w[6],
      this.pos.y+h[6], this.pos.x+w[7], this.pos.y+h[7],
      this.pos.x+w[2], this.pos.y+h[2], this.pos.x+w[7],
      this.pos.y+h[7], this.pos.x+w[3], this.pos.y+h[3],
      this.pos.x+w[3], this.pos.y+h[3], this.pos.x+w[7],
      this.pos.y+h[7], this.pos.x+w[8], this.pos.y+h[8],
      this.pos.x+w[3], this.pos.y+h[3], this.pos.x+w[8],
      this.pos.y+h[8], this.pos.x+w[4], this.pos.y+h[4],
      this.pos.x+w[4], this.pos.y+h[4], this.pos.x+w[8],
      this.pos.y+h[8], this.pos.x+w[9], this.pos.y+h[9],
      this.pos.x+w[4], this.pos.y+h[4], this.pos.x+w[9],
      this.pos.y+h[9], this.pos.x+w[5], this.pos.y+h[5],
      this.pos.x+w[6], this.pos.y+h[6], this.pos.x+w[10],
      this.pos.y+h[10], this.pos.x+w[7], this.pos.y+h[7],
      this.pos.x+w[7], this.pos.y+h[7], this.pos.x+w[10],
      this.pos.y+h[10], this.pos.x+w[11], this.pos.y+h[11],
      this.pos.x+w[7], this.pos.y+h[7], this.pos.x+w[11],
      this.pos.y+h[11], this.pos.x+w[8], this.pos.y+h[8],
      this.pos.x+w[8], this.pos.y+h[8], this.pos.x+w[11],
      this.pos.y+h[11], this.pos.x+w[9], this.pos.y+h[9]]),
      gl.STATIC_DRAW);
  };
};

const accelScaling = 0.07;
const maxSpeed = 4.0;
main();
