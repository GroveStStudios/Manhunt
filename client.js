
//a window global for our game root variable
var game = {};

window.onload = function(){

  //create game client instance
  game = new game_core(){
    //fetch viewport
    game.viewport = document.getElementById('viewport');
    //not sure about this
    game.viewport.width = game.world.width;
    game.viewport.height = game.world.height;
  }

  //initialize gl, programs, and buffers
  game.gl = initGL(this.viewport);
  var prog = makeShaderProgram(gl, 'vert', 'frag');
  game.gl.useProgram(prog);
  setResolutionUniform(game.gl, prog);
  game.colorUniform = game.gl.getUniformLocation(prog, "col");
  var uvBuf = setShaderAttribute(game.gl, prog, "uvcoord");
  //draw tile UVs (same for all tiles so we can just do it here, but draw is in other func?)
  draw(game.gl,0,0,1/3.71);
  var posBuf = setShaderAttribute(game.gl, prog, "pos");
  //makeTexture(game.gl); (will need to change per player)

  game.update(new Date.getTime());
}

function initGL(canvas){
  this.gl = canvas.getContext("webgl");
  if(!this.gl) {
    return;
  }
  this.gl.viewport(0,0,this.gl.canvas.width,this.gl.canvas.height);
  this.gl.clearColor(0,0,0,1);
  this.gl.clear(this.gl.COLOR_BUFFER_BIT);
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
