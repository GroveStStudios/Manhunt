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
function drawTile(gl,x,y,s){
  function mult(x){
    return x*s;
  }
  //map from vertex no. to distance from anchor in x/y dir
  var w = [1,2.71,0,1,2.71,3.71,0,1,2.71,3.71,1,2.71].map(mult);
  var h = [0,0,1,1,1,1,2.71,2.71,2.71,2.71,3.71,3.71].map(mult);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    x+w[0], y+h[0], x+w[2], y+h[2], x+w[3], y+h[3],
    x+w[0], y+h[0], x+w[3], y+h[3], x+w[4], y+h[4],
    x+w[0], y+h[0], x+w[4], y+h[4], x+w[1], y+h[1],
    x+w[1], y+h[1], x+w[4], y+h[4], x+w[5], y+h[5],
    x+w[2], y+h[2], x+w[6], y+h[6], x+w[7], y+h[7],
    x+w[2], y+h[2], x+w[7], y+h[7], x+w[3], y+h[3],
    x+w[3], y+h[3], x+w[7], y+h[7], x+w[8], y+h[8],
    x+w[3], y+h[3], x+w[8], y+h[8], x+w[4], y+h[4],
    x+w[4], y+h[4], x+w[8], y+h[8], x+w[9], y+h[9],
    x+w[4], y+h[4], x+w[9], y+h[9], x+w[5], y+h[5],
    x+w[6], y+h[6], x+w[10], y+h[10], x+w[7], y+h[7],
    x+w[7], y+h[7], x+w[10], y+h[10], x+w[11], y+h[11],
    x+w[7], y+h[7], x+w[11], y+h[11], x+w[8], y+h[8],
    x+w[8], y+h[8], x+w[11], y+h[11], x+w[9], y+h[9]]),
    gl.STATIC_DRAW);
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
  drawTile(gl,0,0,1/3.71); //draw tile UVs, this is the same for all tiles
  var posBuf = setShaderAttribute(gl, prog, "pos");

  //create / bind texture
  //makeTexture(gl);
  gl.uniform3f(colUnifLoc, 1, 1, 1);

  playerPos.x = canv.width/2;
  playerPos.y = canv.height/2;

  //init main loop
  gameLoop(gl, canv, colUnifLoc);
}

function gameLoop(gl, canv, colLoc){
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

const accelScaling = 0.07;
const maxSpeed = 4.0;
var playerPos = {x:0, y:0};
var playerAccel = {x:0, y:0};
var playerVel = {x:0, y:0};
var playerSpeed = 0; //square of player speed

main();
