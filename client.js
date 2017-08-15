
//a window global for our game root variable
var game = {};

window.onload = function(){

  //create game client instance
  game = new game_core();

  game.update(new Date().getTime());
}
