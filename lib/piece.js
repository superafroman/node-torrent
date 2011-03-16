
var BufferUtils = require('./bufferutils');

// TODO: not necessarily getting chunks in order, update so can
// handle this and doesn't incorrectly report completeness

var Piece = function(index, length) {
  this.index = index;
  this.length = length;
  this.data = new Buffer(0);
};

Piece.prototype.nextChunkBegin = function() {
  if (this.data.length >= this.length) {
    return -1;
  }
  return this.data.length;
};

Piece.prototype.updateChunk = function(data) {
  this.data = BufferUtils.concat(this.data, data);
};

Piece.prototype.isComplete = function() {
  return this.data.length === this.length;
};

Piece.CHUNK_LENGTH = 16384;

module.exports = Piece;