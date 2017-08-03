
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

  game.update(new Date.getTime());
}
