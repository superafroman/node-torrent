
/**
 * Object that represents a series of bits, i.e. 10001101.  Bits are stored
 * in order, left to right, for example
 * 
 *   bits:  10001101
 *   index: 01234567
 */
var BitField = function(/* length | buffer, length*/) {
  if (arguments.length !== 1 && arguments.length !== 2) {
    throw new Error('Must create BitField with either a length (Number) or a Buffer and a length.');
  }
  if (typeof arguments[0] === 'number') {
    this.bits = new Uint8Array(arguments[0]);
  } else {
    this.bits = fromBuffer(arguments[0], arguments[1]);
  }
  this.length = this.bits.length;
};

BitField.prototype.set = function(index) {
  this.bits[index] = 1;
};

BitField.prototype.unset = function(index) {
  this.bits[index] = 0;
};

BitField.prototype.toBuffer = function() {
  return toBuffer(this.bits);
};

BitField.prototype.isSet = function(index) {
  return this.bits[index];
};

BitField.prototype.or = function(rhs) {
  var length = Math.min(this.length, rhs.length);
  var ret = new BitField(length);
  for (var i = 0; i < length; i++) {
    ret.bits[i] = this.bits[i] | rhs.bits[i];
  }
  return ret;
};

BitField.prototype.xor = function(rhs) {
  var length = Math.min(this.length, rhs.length);
  var ret = new BitField(length);
  for (var i = 0; i < length; i++) {
    ret.bits[i] = this.bits[i] ^ rhs.bits[i];
  }
  return ret;
};

BitField.prototype.and = function(rhs) {
  var length = Math.min(this.length, rhs.length);
  var ret = new BitField(length);
  for (var i = 0; i < length; i++) {
    ret.bits[i] = this.bits[i] & rhs.bits[i];
  }
  return ret;
};

BitField.prototype.cardinality = function() {
  var count = 0;
  for (var i = 0; i < this.bits.length; i++) {
    if (this.bits[i]) {
      count++;
    }
  }
  return count;
};

BitField.prototype.setIndices = function() {
  var set = [];
  for (var i = 0; i < this.bits.length; i++) {
    if (this.bits[i]) {
      set.push(i);
    }
  }
  return set;
};

BitField.prototype.unsetIndices = function() {
  var unset = [];
  for (var i = 0; i < this.bits.length; i++) {
    if (!this.bits[i]) {
      unset.push(i);
    }
  }
  return unset;
};

BitField.prototype.setAll = function() {
  for (var i = 0; i < this.bits.length; i++) {
    this.set(i);
  }
};

BitField.prototype.unsetAll = function() {
  for (var i = 0; i < this.bits.length; i++) {
    this.unset(i);
  }
};


function toBuffer(array) {

  var buffer = new Buffer(Math.ceil(array.length / 8));
  
  for (var i = 0; i < buffer.length; i++) {
    buffer[i] = 0;
  }

  for (i = 0; i < array.length; i++) {
    if (array[i]) {
      var bit = 7 - (i % 8)
        , byteIndex = ~~(i / 8);
        ;
      buffer[byteIndex] = buffer[byteIndex] | Math.pow(2, bit);
    }
  }
  return buffer;
}

function fromBuffer(buffer, length) {
  var array = new Uint8Array(length);
  for (var i = 0; i < length; i++) {
    var bit = 7 - (i % 8)
      , byteIndex = ~~(i / 8);
      ;
    array[i] = buffer[byteIndex] & Math.pow(2, bit) > 0 ? 1 : 0;
  }
  return array;
}

module.exports = exports = BitField;
