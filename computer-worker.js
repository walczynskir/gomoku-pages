importScripts('engine.js?v=0.7.0', 'computer.js?v=0.7.0');

self.onmessage = ({ data: { game, level } }) => {
  self.postMessage(FiveComputer.chooseMove(game, level));
};
