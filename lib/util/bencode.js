/**
 * Original source:
 *   https://github.com/WizKid/node-bittorrent/blob/master/lib/bencode.js
 */

function Decoder(content) {
    this.pos = 0;
    this.content = content;
}

Decoder.prototype = {
    decode: function(ignoreRemainder) {
        var ret = this._decode();
        if (ignoreRemainder) {
            return [ret, this.pos];
        }
        if (this.pos != this.content.length) {
            throw "Wrongly formatted bencoding string. Tried to parse something it didn't understood "+ this.pos +", "+ this.content.length;
        }
        return ret;
    },

    _decode: function () {
        if (this.pos >= this.content.length)
            throw "Wrongly formatted bencoding string. Pos have passed the length of the string."

        var ret;
        var c = this.content.charAt(this.pos);
        switch (c) {
            // Integer
            case 'i':
                var s = this.pos + 1;
                while (this.pos < this.content.length && this.content.charAt(this.pos) != 'e')
                    this.pos++;

                this.pos++;
                ret = parseInt(this.content.substring(s, this.pos));
                break;

            // Dict
            case 'd':
                ret = {};
                this.pos++;
                while (this.pos < this.content.length && this.content.charAt(this.pos) != 'e') {
                    var key = this._decode();
                    if (key.constructor != String)
                        throw "Keys in dict must be strings"
                    ret[key] = this._decode();
                }

                this.pos++;
                break;

            // List
            case 'l':
                ret = [];
                this.pos++;
                while (this.pos < this.content.length && this.content.charAt(this.pos) != 'e')
                    ret.push(this._decode());

                this.pos++;
                break;

            // String
            case '0':
            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
            case '6':
            case '7':
            case '8':
            case '9':
                var s = this.pos;
                while (this.pos < this.content.length && this.content.charAt(this.pos) != ':')
                    this.pos++;

                var len = parseInt(this.content.substring(s, this.pos));
                s = this.pos + 1;
                this.pos = s + len;
                ret = this.content.substring(s, this.pos);
                break;

            default:
                throw "Can't decode. No type starts with: " + c + ", at position " + this.pos;
                break;
        }

        return ret;
    }
}

function encode(obj) {
    var ret;
    switch(obj.constructor) {
        case Number:
            if (Math.round(obj) !== obj)
                throw "Numbers can only contain integers and not floats";

            ret = "i"+ obj.toString() +"e";
            break;
        case String:
            ret = obj.length +":"+ obj;
            break;
        case Array:
            ret = "l";
            for (var k in obj)
                ret += encode(obj[k]);
            ret += "e";
            break;
        case Object:
            ret = "d";
            for (var k in obj)
                ret += encode(k) + encode(obj[k]);
            ret += "e";
            break;
        default:
            throw "Bencode can only encode integers, strings, lists and dicts";
            break;
    }
    return ret;
}

exports.decode = function(content, ignoreRemainder) {
    var p = new Decoder(content);
    return p.decode(ignoreRemainder);
}

exports.encode = function(obj) {
    return encode(obj);
}
