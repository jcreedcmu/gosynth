// ported from @shaktool's https://code.google.com/p/beepbox/
var _ = require("underscore");

function BitField(bitfield) {
  this.base64 = base64;
  this.bits = [];
  this.readIndex = 0;
}

BitField.prototype.load = function(source) {
  var that = this;
  _.each(source.split(""), function(char) {
    var value = that.base64.indexOf(char);
    that.bits.push(!!(value & 0x20));
    that.bits.push(!!(value & 0x10));
    that.bits.push(!!(value & 0x08));
    that.bits.push(!!(value & 0x04));
    that.bits.push(!!(value & 0x02));
    that.bits.push(!!(value & 0x01));
  });
}

BitField.prototype.addPadding = function() {
  while ((this.bits.length % 6) != 0) {
    this.bits.push(false);
  }
}

BitField.prototype.skipPadding = function() {
  this.readIndex += 5 - ((this.readIndex + 5) % 6);
}

BitField.prototype.write = function(bitCount, value) {
  bitCount--;
  while (bitCount >= 0) {
    this.bits.push(((value >> bitCount) & 1) == 1);
    bitCount--;
  }
}

BitField.prototype.read = function(bitCount) {
  var result = 0;
  while (bitCount > 0) {
    result = result << 1;
    result += this.bits[this.readIndex++] ? 1 : 0;
    bitCount--;
  }
  return result;
}

BitField.prototype.writeLongTail = function(minValue, minBits, value) {
  if (value < minValue) throw new Error();
  value -= minValue;
  var numBits = minBits;
  while (value >= (1 << numBits)) {
    this.bits.push(true);
    value -= 1 << numBits;
    numBits++;
  }
  this.bits.push(false);
  while (numBits > 0) {
    numBits--;
    this.bits.push((value & (1 << numBits)) != 0);
  }
}

BitField.prototype.readLongTail = function(minValue, minBits) {
  var result = minValue;
  var numBits = minBits;
  while (this.bits[this.readIndex++]) {
    result += 1 << numBits;
    numBits++;
  }
  while (numBits > 0) {
    numBits--;
    if (this.bits[this.readIndex++]) {
      result += 1 << numBits;
    }
  }
  return result;
}

BitField.prototype.writePartDuration = function(value) {
  this.writeLongTail(1, 2, value);
}

BitField.prototype.readPartDuration = function() {
  return this.readLongTail(1, 2);
}

BitField.prototype.writePinCount = function(value) {
  this.writeLongTail(1, 0, value);
}

BitField.prototype.readPinCount = function() {
  return this.readLongTail(1, 0);
}

BitField.prototype.writeNoteInterval = function(value) {
  if (value < 0) {
    this.write(1, 1); // sign
    this.writeLongTail(1, 3, -value);
  } else {
    this.write(1, 0); // sign
    this.writeLongTail(1, 3, value);
  }
}

BitField.prototype.readNoteInterval = function() {
  if (this.read(1)) {
    return -this.readLongTail(1, 3);
  } else {
    return this.readLongTail(1, 3);
  }
}

BitField.prototype.concat = function(other) {
  this.bits = this.bits.concat(other.bits);
}

BitField.prototype.toString = function() {
  var paddedBits = this.bits.concat([false, false, false, false, false, false]);
  var result = "";
  for (var i = 0; i < this.bits.length; i += 6) {
    var value = 0;
    if (this.bits[i+0]) value += 0x20;
    if (this.bits[i+1]) value += 0x10;
    if (this.bits[i+2]) value += 0x08;
    if (this.bits[i+3]) value += 0x04;
    if (this.bits[i+4]) value += 0x02;
    if (this.bits[i+5]) value += 0x01;
    result += this.base64[value];
  }
  return result;
}

BitField.prototype.traceBits = function() {
    console.log(this.bits);
}

module.exports = BitField;
