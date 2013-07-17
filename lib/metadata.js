
var bencode = require('./util/bencode'),
    crypto = require("crypto"),
    util = require('util'),
    BitField = require('./util/bitfield')
    EventEmitter = require('events').EventEmitter,
    BufferUtils = require('./util/bufferutils');

var LOGGER = require('log4js').getLogger('metadata.js');

function Metadata(infoHash, metadata) {
  EventEmitter.call(this);
  this.infoHash = infoHash;
  this.bitfield = null;
  this._encodedMetadata = null;
  this._length = 0;
  this.setMetadata(metadata);
}
util.inherits(Metadata, EventEmitter);

Metadata.prototype.isComplete = function() {
  if (!this.bitfield || this.bitfield.length === 0) {
    return false;
  }
  return this.bitfield.cardinality() === this.bitfield.length;
};

Metadata.prototype.hasLength = function() {
  return this._length > 0;
};

Metadata.prototype.setLength = function(length) {
  this._length = length;
  if (!this._encodedMetadata || this._encodedMetadata.length !== length) {
    this.bitfield = new BitField(Math.ceil(length / Metadata.BLOCK_SIZE));
    this._encodedMetadata = new Buffer(length);
  }
};

Metadata.prototype.setMetadata = function(_metadata) {
  
  if (!_metadata) return;

  var metadata = this;
  metadata._metadata = _metadata;

  Object.keys(_metadata).forEach(function(key) {
    metadata[key] = _metadata[key];
  });

  if (this.files && this._encodedMetadata) {
    LOGGER.debug(this._encodedMetadata.length);
    LOGGER.debug(_metadata.pieces.length);
    LOGGER.debug(typeof(_metadata.pieces));
    this._encodedMetadata = new Buffer(bencode.encode(_metadata));
    LOGGER.debug(this._encodedMetadata.length);
    
    this.setLength(this._encodedMetadata.length);
    this.bitfield.setAll();
  }

  if (!this.infoHash) {
    this.infoHash = new Buffer(crypto.createHash('sha1')
      .update(bencode.encode(_metadata))
      .digest(), 'binary');
    LOGGER.debug('Metadata complete.');
    this.emit(Metadata.COMPLETE);
  } else if (this.isComplete()) {
    var infoHash = new Buffer(crypto.createHash('sha1')
      .update(this._encodedMetadata)
      .digest(), 'binary');
    if (!BufferUtils.equal(this.infoHash, infoHash)) {
      LOGGER.warn('Metadata is invalid, reseting.');
      this.bitfield.unsetAll();
      this.emit(Metadata.INVALID);
      throw "BOOM"; // TODO: why does re-encoding the metadata cos this to fail?
    } else {
      LOGGER.debug('Metadata complete.');
      this.emit(Metadata.COMPLETE);
    }
  }
};

Metadata.prototype.setPiece = function(index, data) {
  if (this.bitfield.isSet(index)) {
    return;
  }
  LOGGER.debug('Setting piece at index %d with %d bytes', index, data.length);
  this.bitfield.set(index);
  data.copy(this._encodedMetadata, index * Metadata.BLOCK_SIZE, 0, data.length);
  if (this.isComplete()) {
    this.setMetadata(bencode.decode(this._encodedMetadata.toString('binary')));
  }
};

Metadata.COMPLETE = 'metadata:complete';
Metadata.INVALID = 'metadata:invalid';

Metadata.BLOCK_SIZE = 16384;

module.exports = exports = Metadata;
