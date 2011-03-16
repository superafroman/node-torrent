
/**
 * new BitField(length);
 * new BitField(buffer);
 */
var BitField = function() {
  if (arguments.length !== 1) {
    throw new Error('Must create BitField with either a Number (length) or a Buffer.');
  }
  if (typeof arguments[0] === 'number') {
    this.length = arguments[0];
    this.bitfield = new Buffer(Math.ceil(this.length / 8));
    for (var i = 0; i < this.bitfield.length; i++) {
      this.bitfield[i] = 0;
    }
  } else {
    this.bitfield = arguments[0];
    this.length = this.bitfield.length * 8;
  }
};

BitField.prototype.set = function(index) {
  var bit = index % 8;
  index = Math.floor(index / 8);
  this.bitfield[index] = this.bitfield[index] | Math.pow(2, bit);
};

BitField.prototype.unset = function(index) {
  var bit = index % 8;
  index = Math.floor(index / 8);
  var val = Math.pow(2, bit);
  if (this.bitfield[index] & val) {
    this.bitfield[index] -= val;
  }
};

BitField.prototype.toBuffer = function() {
  return new Buffer(this.bitfield);
};

BitField.prototype.isSet = function(index) {
  var bit = index % 8;
  index = Math.floor(index / 8);
  return (this.bitfield[index] & Math.pow(2, bit)) > 0;
};

BitField.prototype.xor = function(rhs) {
  var length = Math.min(this.bitfield.length, rhs.bitfield.length);
  var ret = new Buffer(length);
  for (var i = 0; i < length; i++) {
    ret[i] = this.bitfield[i] ^ rhs.bitfield[i];
  }
  return new BitField(ret);
};

BitField.prototype.and = function(rhs) {
  var length = Math.min(this.bitfield.length, rhs.bitfield.length);
  var ret = new Buffer(length);
  for (var i = 0; i < length; i++) {
    ret[i] = this.bitfield[i] & rhs.bitfield[i];
  }
  return new BitField(ret);
};

BitField.prototype.setIndexes = function() {
  var set = [];
  for (var i = 0; i < this.length; i++) {
    if (this.isSet(i)) {
      set.push(i);
    }
  }
  return set;
};

module.exports = BitField;