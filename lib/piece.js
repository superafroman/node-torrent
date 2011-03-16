
var BufferUtils = require('./bufferutils');

var Piece = function(index, length) {
  this.index = index;
  this.data = new Buffer(length);
  this.chunks = 0;
  this.totalChunks = Math.ceil(length / Piece.CHUNK_LENGTH);
};

Piece.prototype.nextChunkBegin = function() {
  if (this.isComplete()) {
    return -1;
  }
  return this.chunks * Piece.CHUNK_LENGTH;
};

Piece.prototype.addChunk = function(begin, data) {
  data.copy(this.data, begin, 0);
  this.chunks++;
};

Piece.prototype.isComplete = function() {
  return this.chunks === this.totalChunks;
};

Piece.CHUNK_LENGTH = 16384;

module.exports = Piece;
