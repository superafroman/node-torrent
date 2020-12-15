var Piece = require('../piece');

var LOGGER = require('log4js').getLogger('createpieces.js');

function createPieces(hashes, files, pieceLength, sizeOfDownload, persistPieces, callback) {
  var pieces = [],
    numberOfPieces = hashes.length / 20,
    currentIndex = 0;
  
  createPiece(pieces, hashes, files, currentIndex, numberOfPieces, pieceLength,
    sizeOfDownload, persistPieces, callback);
}

function createPiece(pieces, hashes, files, currentIndex, numberOfPieces, pieceLength, 
    sizeOfDownload, persistPieces, callback) {
  if (currentIndex === numberOfPieces) {
    callback(null, pieces);
  } else {
    var hash = hashes.substr(currentIndex * 20, 20)
      , lengthOfNextPiece = pieceLength;
      ;
    if (currentIndex === (numberOfPieces - 1)) {
      lengthOfNextPiece = sizeOfDownload % pieceLength;
    }
    var piece = new Piece(currentIndex, currentIndex * pieceLength, lengthOfNextPiece, hash,
        files, persistPieces[currentIndex], function() {
      createPiece(pieces, hashes, files, currentIndex + 1, numberOfPieces, pieceLength, 
        sizeOfDownload, callback);
    });
    pieces.push(piece);
  }
}

module.exports = exports = createPieces;
