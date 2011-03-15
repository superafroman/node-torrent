
var Piece = function(index, length) {
  this.index = index;
  this.length = length;
  this.piece = new Buffer(0);
};

Piece.prototype.nextChunkBegin = function() {
  if (this.piece.length >= this.length) {
    return -1;
  }
  return this.piece.length;
};

Piece.prototype.updateChunk(data) {
  this.piece = BufferUtils.concat(this.piece, data);
};

Piece.CHUNK_LENGTH = 16384;

module.exports = Piece;