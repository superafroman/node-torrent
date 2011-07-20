var vows = require('vows');
var assert = require('assert');

var BitField = require('../../lib/util/bitfield');

vows.describe('BitField').addBatch({
  "A BitField set to 10101": {
    topic: function() {
      var bf = new BitField(5);
      bf.set(0);
      bf.set(2);
      bf.set(4);
      return bf;
    },
    "when calling `xor(BitField(00111))`": {
      topic: function(bitfield) {
        var rhs = new BitField(5);
        rhs.set(2);
        rhs.set(3);
        rhs.set(4);
        return bitfield.xor(rhs);
      },
      "should return `BitField(10010)`": function(result) {
        assert.ok(result.isSet(0));
        assert.ok(!result.isSet(1));
        assert.ok(!result.isSet(2));
        assert.ok(result.isSet(3));
        assert.ok(!result.isSet(4));
      }
    },
    "when calling `and(BitField(00111))`": {
      topic: function(bitfield) {
        var rhs = new BitField(5);
        rhs.set(2);
        rhs.set(3);
        rhs.set(4);
        return bitfield.and(rhs);
      },
      "should return `BitField(00101)`": function(result) {
        assert.ok(!result.isSet(0));
        assert.ok(!result.isSet(1));
        assert.ok(result.isSet(2));
        assert.ok(!result.isSet(3));
        assert.ok(result.isSet(4));
      }
    },
    "when calling `setIndices()`": {
      topic: function(bitfield) {
        return bitfield.setIndices();
      },
      "should return `[0, 2, 4]`": function(result) {
        assert.equal(result[0], 0);
        assert.equal(result[1], 2);
        assert.equal(result[2], 4);
      }
    }
  }
}).export(module);