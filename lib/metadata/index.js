var bencode = require('../util/bencode'),
    crypto = require("crypto");

var BitField = require('../util/bitfield');

var retrievers = {
  'http:': require('./http'),
  'https:': require('./http'),
  'file:': require('./file'),
  'magnet:': require('./magnet')
};

function Metadata(metadata) {
  this.bitfield = null;
  this._encodedMetadata = null;
  this._length = -1;
  this.setMetadata(metadata);
}

Metadata.prototype.isComplete = function() {
  if (!this.bitfield) {
    return false;
  }
  return this.bitfield.cardinality() === this.bitfield.length;
};

Metadata.prototype.hasLength = function() {
  return this._length > -1;
};

Metadata.prototype.setLength = function(length) {
  this._length = length;
  this.bitfield = new BitField(length / Metadata.BLOCK_SIZE);
};

Metadata.prototype.setMetadata = function(_metadata) {
  
  var metadata = this;
  metadata._metadata = _metadata;

  Object.keys(_metadata).forEach(function(key) {
    metadata[key] = _metadata[key];
  });

  if (this.files) {
    this._encodedMetadata = bencode.encode(_metadata);
    this.setLength(this.encodedMetadata.length);
    this.bitfield.setAll();
  } else {
    this.setLength(0);
  }

  if (!this.infoHash) {
    this.infoHash = new Buffer(crypto.createHash('sha1')
        .update(bencode.encode(_metadata.info))
        .digest(), 'binary');
  } else {
    // validate our info hash equals the new data's hash
  }
};

Metadata.loadMetadata = function(url, callback) {
	var parsedUrl = require('url').parse(url),
		protocol = parsedUrl.protocol || 'file:'
		retriever = retrievers[protocol];

	if (!retriever) {
		callback(new Error('No metadata retriever for given URL, URL = ' + url));
	} else {
		retriever.load(url, function(error, metadata) {
      if (error) {
        callback(error);
      } else {
        callback(null, new Metadata(metadata));
      }
    });
	}
};

Object.defineProperty(Metadata, 'BLOCK_SIZE', { value: 16384 });

module.exports = exports = Metadata;
