// ported from @shaktool's https://code.google.com/p/beepbox/

var latestVersion = 5;
var BitField = require('./bitfield');
var Music = require('./music');
var _ = require("underscore");

base64 = ["0","1","2","3","4","5","6","7","8","9","a","b","c","d","e","f",
	  "g","h","i","j","k","l","m","n","o","p","q","r","s","t","u","v",
	  "w","x","y","z","A","B","C","D","E","F","G","H","I","J","K","L",
	  "M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","-","_"];

//////////////////////////////////////////////////

function Tone(note, start, end, volume, fadeout) {
  this.notes = [note];
  this.pins = [new TonePin(0,0,volume), new TonePin(0, end-start, fadeout ? 0 : volume)];
  this.start = start;
  this.end = end;
}

function TonePin(interval, time, volume) {
  this.interval = interval;
  this.time = time;
  this.volume = volume;
}

function BarPattern() {
  this.tones = [];
  this.instrument = 0;
}

function song_to_string(song) {
  var channel, i, bits, result = "";

  result += base64[latestVersion];
  result += "s" + base64[song.scale];
  result += "k" + base64[song.key];
  result += "l" + base64[song.loopStart >> 6] + base64[song.loopStart & 0x3f];
  result += "e" + base64[(song.loopLength - 1) >> 6] + base64[(song.loopLength - 1) & 0x3f];
  result += "t" + base64[song.tempo];
  result += "a" + base64[song.beats - 1];
  result += "g" + base64[(song.bars - 1) >> 6] + base64[(song.bars - 1) & 0x3f];
  result += "j" + base64[song.patterns - 1];
  result += "i" + base64[song.instruments - 1];
  result += "r" + base64[Music.partCounts.indexOf(song.parts)];

  result += "w";
  for (channel = 0; channel < Music.numChannels; channel++) for (i = 0; i < song.instruments; i++) {
    result += base64[song.instrumentWaves[channel][i]];
  }

  result += "f";
  for (channel = 0; channel < Music.numChannels; channel++) for (i = 0; i < song.instruments; i++) {
    result += base64[song.instrumentFilters[channel][i]];
  }

  result += "d";
  for (channel = 0; channel < Music.numChannels; channel++) for (i = 0; i < song.instruments; i++) {
    result += base64[song.instrumentAttacks[channel][i]];
  }

  result += "c";
  for (channel = 0; channel < Music.numChannels; channel++) for (i = 0; i < song.instruments; i++) {
    result += base64[song.instrumentEffects[channel][i]];
  }

  result += "h";
  for (channel = 0; channel < Music.numChannels; channel++) for (i = 0; i < song.instruments; i++) {
    result += base64[song.instrumentChorus[channel][i]];
  }

  result += "v";
  for (channel = 0; channel < Music.numChannels; channel++) for (i = 0; i < song.instruments; i++) {
    result += base64[song.instrumentVolumes[channel][i]];
  }

  result += "o";
  for (channel = 0; channel < Music.numChannels; channel++) {
    result += base64[song.channelOctaves[channel]];
  }

  result += "b";
  bits = new BitField(base64);
  var neededBits = 0;
  while ((1 << neededBits) < song.patterns + 1) neededBits++;
  for (channel = 0; channel < Music.numChannels; channel++) for (i = 0; i < song.bars; i++) {
    bits.write(neededBits, song.channelBars[channel][i]);
  }
  result += bits.toString();

  result += "p";
  bits = new BitField(base64);
  var neededInstrumentBits = 0;
  while ((1 << neededInstrumentBits) < song.instruments) neededInstrumentBits++;
  for (channel = 0; channel < Music.numChannels; channel++) {
    var octaveOffset = channel == 3 ? 0 : song.channelOctaves[channel] * 12;
    var lastNote = (channel == 3 ? 4 : 12) + octaveOffset;
    var recentNotes = channel == 3 ? [4,6,7,2,3,8,0,10] : [12, 19, 24, 31, 36, 7, 0];
    var recentShapes = [];
    for (i = 0; i < recentNotes.length; i++) {
      recentNotes[i] += octaveOffset;
    }
    _.each(_.range(song.patterns), function(px) {
      var p = song.channelPatterns[channel][px];
      if (p == null) {
	p = new BarPattern();
      }

      bits.write(neededInstrumentBits, p.instrument);

      if (p.tones != null && p.tones.length > 0) {
	bits.write(1, 1);

	var curPart = 0;
	_.each(p.tones, function(t) {
	  if (t.start > curPart) {
	    bits.write(2, 0); // rest
	    bits.writePartDuration(t.start - curPart);
	  }

	  var shapeBits = new BitField(base64);

	  // 0: 1 note, 10: 2 notes, 110: 3 notes, 111: 4 notes
	  for (i = 1; i < t.notes.length; i++) shapeBits.write(1,1);
	  if (t.notes.length < 4) shapeBits.write(1,0);

	  shapeBits.writePinCount(t.pins.length - 1);

	  shapeBits.write(2, t.pins[0].volume); // volume

	  var shapePart = 0;
	  var startNote = t.notes[0];
	  var currentNote = startNote;
	  var pitchBends = [];
	  for (i = 1; i < t.pins.length; i++) {
	    var pin = t.pins[i];
	    var nextNote = startNote + pin.interval;
	    if (currentNote != nextNote) {
	      shapeBits.write(1, 1);
	      pitchBends.push(nextNote);
	      currentNote = nextNote;
	    } else {
	      shapeBits.write(1, 0);
	    }
	    shapeBits.writePartDuration(pin.time - shapePart);
	    shapePart = pin.time;
	    shapeBits.write(2, pin.volume);
	  }

	  var shapeString = shapeBits.toString();
	  var shapeIndex = recentShapes.indexOf(shapeString);
	  if (shapeIndex == -1) {
	    bits.write(2, 1); // new shape
	    bits.concat(shapeBits);
	  } else {
	    bits.write(1, 1); // old shape
	    bits.writeLongTail(0, 0, shapeIndex);
	    recentShapes.splice(shapeIndex, 1);
	  }
	  recentShapes.unshift(shapeString);
	  if (recentShapes.length > 10) recentShapes.pop();

	  var allNotes = t.notes.concat(pitchBends);
	  for (i = 0; i < allNotes.length; i++) {
	    var note = allNotes[i];
	    var noteIndex = recentNotes.indexOf(note);
	    if (noteIndex == -1) {
	      var interval = 0;
	      var noteIter = lastNote;
	      if (noteIter < note) {
		while (noteIter != note) {
		  noteIter++;
		  if (recentNotes.indexOf(noteIter) == -1) interval++;
		}
	      } else {
		while (noteIter != note) {
		  noteIter--;
		  if (recentNotes.indexOf(noteIter) == -1) interval--;
		}
	      }
	      bits.write(1, 0);
	      bits.writeNoteInterval(interval);
	    } else {
	      bits.write(1, 1);
	      bits.write(3, noteIndex);
	      recentNotes.splice(noteIndex, 1);
	    }
	    recentNotes.unshift(note);
	    if (recentNotes.length > 8) recentNotes.pop();

	    if (i == t.notes.length - 1) {
	      lastNote = t.notes[0];
	    } else {
	      lastNote = note;
	    }
	  }
	  curPart = t.end;
	});

	if (curPart < song.beats * song.parts) {
	  bits.write(2, 0); // rest
	  bits.writePartDuration(song.beats * song.parts - curPart);
	}
      } else {
	bits.write(1, 0);
      }
    });
  }
  var bitString = bits.toString();
  var stringLength = bitString.length;
  var digits = "";
  while (stringLength > 0) {
    digits = base64[stringLength & 0x3f] + digits;
    stringLength = stringLength >> 6;
  }
  result += base64[digits.length];
  result += digits;
  result += bitString;

  return result;
}

function string_to_song(compressed) {
  var channelPatterns = _.times(4, function() {
    return _.times(8, function() {
      return new BarPattern(); }); });

  var channelBars = _.times(4, function() {
    return _.times(16, function() {
      return 1; }); });

  var channelOctaves = [3,2,1,0];
  var instrumentVolumes = [[0],[0],[0],[0]];
  var instrumentWaves   = [[1],[1],[1],[1]];
  var instrumentFilters = [[0],[0],[0],[0]];
  var instrumentAttacks = [[1],[1],[1],[1]];
  var instrumentEffects = [[0],[0],[0],[0]];
  var instrumentChorus  = [[0],[0],[0],[0]];
  var scale = 0;
  var key = Music.keyNames.length - 1;
  var loopStart = 0;
  var loopLength = 4;
  var tempo = 2;
  var beats = 8;
  var bars = 16;
  var patterns = 8;
  var parts = 4;
  var instruments = 1;

  if (compressed == null || compressed.length == 0)
    return null;
  if (compressed.charAt(0) == "#")
    compressed = compressed.substring(1);
  var charIndex = 0;
  var version = base64.indexOf(compressed.charAt(charIndex++));
  var beforeFive = version < 5;

  while (charIndex < compressed.length) {
    var command = compressed.charAt(charIndex++);
    var bits;
    var channel;
    var i;
    var j;

    switch (command) {
    case "s":
      scale = base64.indexOf(compressed.charAt(charIndex++));
      break;
    case "k":
      key = base64.indexOf(compressed.charAt(charIndex++));
      break;
    case "l":
      if (beforeFive) {
	loopStart = base64.indexOf(compressed.charAt(charIndex++));
      }
      else {
	loopStart = (base64.indexOf(compressed.charAt(charIndex++)) << 6) +
	  base64.indexOf(compressed.charAt(charIndex++));
      }
      break;
    case "e":
      if (beforeFive) {
	loopLength = base64.indexOf(compressed.charAt(charIndex++));
      }
      else {
	loopLength = (base64.indexOf(compressed.charAt(charIndex++)) << 6) +
	  base64.indexOf(compressed.charAt(charIndex++)) + 1;
      }
      break;
    case "t":
      tempo = base64.indexOf(compressed.charAt(charIndex++));
      break;
    case "a":
      beats = base64.indexOf(compressed.charAt(charIndex++)) + 1;
      beats = Math.max(Music.beatsMin, Math.min(Music.beatsMax, beats));
      break;
    case "g":
      bars = (base64.indexOf(compressed.charAt(charIndex++)) << 6) + base64.indexOf(compressed.charAt(charIndex++)) + 1;
      bars = Math.max(Music.barsMin, Math.min(Music.barsMax, bars));
      break;
    case "j":
      patterns = base64.indexOf(compressed.charAt(charIndex++)) + 1;
      patterns = Math.max(Music.patternsMin, Math.min(Music.patternsMax, patterns));
      break;
    case "i":
      instruments = base64.indexOf(compressed.charAt(charIndex++)) + 1;
      instruments = Math.max(Music.instrumentsMin, Math.min(Music.instrumentsMax, instruments));
      break;
    case "r":
      parts = Music.partCounts[base64.indexOf(compressed.charAt(charIndex++))];
      break;
    case "w":
      for (channel = 0; channel < Music.numChannels; channel++)
	for (i = 0; i < instruments; i++) {
  	  instrumentWaves[channel][i] = clip(0, Music.waveNames.length, base64.indexOf(compressed.charAt(charIndex++)));
	}
      break;
    case "f":
      for (channel = 0; channel < Music.numChannels; channel++)
	for (i = 0; i < instruments; i++) {
  	  instrumentFilters[channel][i] = clip(0, Music.filterNames.length, base64.indexOf(compressed.charAt(charIndex++)));
	}
      break;
    case "d":
      for (channel = 0; channel < Music.numChannels; channel++)
	for (i = 0; i < instruments; i++) {
  	  instrumentAttacks[channel][i] = clip(0, Music.attackNames.length, base64.indexOf(compressed.charAt(charIndex++)));
	}
      break;
    case "c":
      for (channel = 0; channel < Music.numChannels; channel++)
	for (i = 0; i < instruments; i++) {
  	  instrumentEffects[channel][i] = clip(0, Music.effectNames.length, base64.indexOf(compressed.charAt(charIndex++)));
	}
      break;
    case "h":
      for (channel = 0; channel < Music.numChannels; channel++)
	for (i = 0; i < instruments; i++) {
  	  instrumentChorus[channel][i] = clip(0, Music.chorusNames.length, base64.indexOf(compressed.charAt(charIndex++)));
	}
      break;
    case "v":
      for (channel = 0; channel < Music.numChannels; channel++)
	for (i = 0; i < instruments; i++) {
  	  instrumentVolumes[channel][i] = clip(0, Music.volumeNames.length, base64.indexOf(compressed.charAt(charIndex++)));
	}
      break;
    case "o":
      for (channel = 0; channel < Music.numChannels; channel++) {
  	channelOctaves[channel] = clip(0, 5, base64.indexOf(compressed.charAt(charIndex++)));
      }
      break;
    case "b":
      var neededBits = 0;

      if (beforeFive) {
	while ((1 << neededBits) < patterns) neededBits++;
	bits = new BitField(base64);
	var subStringLength = Math.ceil(Music.numChannels * bars * neededBits / 6);
	bits.load(compressed.substr(charIndex, subStringLength));
	for (channel = 0; channel < Music.numChannels; channel++)
	  for (i = 0; i < bars; i++) {
  	    channelBars[channel][i] = bits.read(neededBits) + 1;
	  }
      }
      else {
	while ((1 << neededBits) < patterns + 1) neededBits++;
	bits = new BitField(base64);
	var subStringLength = Math.ceil(Music.numChannels * bars * neededBits / 6);
	bits.load(compressed.substr(charIndex, subStringLength));
	for (channel = 0; channel < Music.numChannels; channel++)
	  for (i = 0; i < bars; i++) {
  	    channelBars[channel][i] = bits.read(neededBits);
	  }
      }

      charIndex += subStringLength;

      break;
    case "p":
      var bitStringLength = 0;
      channel = 0;
      var bitStringLengthLength = base64.indexOf(compressed.charAt(charIndex++));
      while (bitStringLengthLength > 0) {
  	bitStringLength = bitStringLength << 6;
  	bitStringLength += base64.indexOf(compressed.charAt(charIndex++));
  	bitStringLengthLength--;
      }

      bits = new BitField(base64);
      bits.load(compressed.substr(charIndex, bitStringLength));
      charIndex += bitStringLength;

      var neededInstrumentBits = 0;
      while ((1 << neededInstrumentBits) < instruments)
	neededInstrumentBits++;
      while (true) {
  	channelPatterns[channel] = [];

  	var octaveOffset = channel == 3 ? 0 : channelOctaves[channel] * 12;
  	var tone = null;
  	var pin = null;
  	var lastNote = (channel == 3 ? 4 : 12) + octaveOffset;
  	var recentNotes = channel == 3 ? [4,6,7,2,3,8,0,10] : [12, 19, 24, 31, 36, 7, 0];
  	var recentShapes = [];
  	for (i = 0; i < recentNotes.length; i++) {
  	  recentNotes[i] += octaveOffset;
  	}
  	for (i = 0; i < patterns; i++) {
  	  var newPattern = new BarPattern()
  	  newPattern.instrument = bits.read(neededInstrumentBits);
  	  channelPatterns[channel][i] = newPattern;

  	  if (bits.read(1) == 0)
	    continue;

  	  var curPart = 0;
  	  var newTones = [];
  	  while (curPart < beats * parts) {

  	    var useOldShape = bits.read(1) == 1;
  	    var newTone = false;
  	    var shapeIndex = 0;
  	    if (useOldShape == 1) {
  	      shapeIndex = bits.readLongTail(0, 0);
  	    } else {
  	      newTone = bits.read(1) == 1;
  	    }

  	    if (!useOldShape && !newTone) {
  	      var restLength = bits.readPartDuration();
  	      curPart += restLength;
  	    } else {
  	      var shape;
  	      var pinObj;
  	      var note;
  	      if (useOldShape) {
  		shape = recentShapes[shapeIndex];
  		recentShapes.splice(shapeIndex, 1);
  	      } else {
  		shape = {};

  		shape.noteCount = 1;
  		while (shape.noteCount < 4 && bits.read(1) == 1) shape.noteCount++;

  		shape.pinCount = bits.readPinCount();
  		shape.initialVolume = bits.read(2);

  		shape.pins = [];
  		shape.length = 0;
  		shape.bendCount = 0;
  		for (j = 0; j < shape.pinCount; j++) {
  		  pinObj = {};
  		  pinObj.pitchBend = bits.read(1) == 1;
  		  if (pinObj.pitchBend) shape.bendCount++;
  		  shape.length += bits.readPartDuration();
  		  pinObj.time = shape.length;
  		  pinObj.volume = bits.read(2);
  		  shape.pins.push(pinObj);
  		}
  	      }
  	      recentShapes.unshift(shape);
  	      if (recentShapes.length > 10) recentShapes.pop();

  	      tone = new Tone(0,curPart,curPart + shape.length, shape.initialVolume);
  	      tone.notes = [];
  	      tone.pins.length = 1;
  	      var pitchBends = [];
  	      for (j = 0; j < shape.noteCount + shape.bendCount; j++) {
  		var useOldNote = bits.read(1) == 1;
  		if (!useOldNote) {
  		  var interval = bits.readNoteInterval();
  		  note = lastNote;
  		  var intervalIter = interval;
  		  while (intervalIter > 0) {
  		    note++;
  		    while (recentNotes.indexOf(note) != -1) note++;
  		    intervalIter--;
  		  }
  		  while (intervalIter < 0) {
  		    note--;
  		    while (recentNotes.indexOf(note) != -1) note--;
  		    intervalIter++;
  		  }
  		} else {
  		  var noteIndex = bits.read(3);
  		  note = recentNotes[noteIndex];
  		  recentNotes.splice(noteIndex, 1);
  		}

  		recentNotes.unshift(note);
  		if (recentNotes.length > 8) recentNotes.pop();

  		if (j < shape.noteCount) {
  		  tone.notes.push(note);
  		} else {
  		  pitchBends.push(note);
  		}

  		if (j == shape.noteCount - 1) {
  		  lastNote = tone.notes[0];
  		} else {
  		  lastNote = note;
  		}
  	      }

  	      pitchBends.unshift(tone.notes[0]);

  	      _.each(shape.pins, function(pinObj) {
  		if (pinObj.pitchBend) pitchBends.shift();
  		pin = new TonePin(pitchBends[0] - tone.notes[0], pinObj.time, pinObj.volume);
  		tone.pins.push(pin);
  	      });
  	      curPart = tone.end;
  	      newTones.push(tone);
  	    }
  	  }
  	  newPattern.tones = newTones;
  	}

  	channel++;
  	if (channel >= Music.numChannels)
	  break; // while loop
      }


      break; // in switch
    default:
      throw ("Unknown command " + command);
    }
  }

  var extra = {
    channelPatterns: channelPatterns,
    channelBars: channelBars,
    channelOctaves: channelOctaves,
    instrumentVolumes: instrumentVolumes,
    instrumentWaves  : instrumentWaves,
    instrumentFilters: instrumentFilters,
    instrumentAttacks: instrumentAttacks,
    instrumentEffects: instrumentEffects,
    instrumentChorus : instrumentChorus,
    scale: scale,
    key: key,
    loopStart: loopStart,
    loopLength: loopLength,
    tempo: tempo,
    beats: beats,
    bars: bars,
    patterns: patterns,
    parts: parts,
    instruments: instruments
  };

  return _.extend(new Song(), extra);
}

function clip(min, max, val) {
  return Math.min(max, Math.max(min, val));
}

function Song() { }

Song.prototype.getPattern = function(chan, bar) {
  var patternIndex = this.channelBars[chan][bar];
  if (patternIndex == 0) return null;
  return this.channelPatterns[chan][patternIndex - 1];
};

Song.prototype.getPatternInstrument = function(chan, bar) {
  var pattern = this.getPattern(chan, bar);
  return pattern == null ? 0 : pattern.instrument;
};

module.exports.song_to_string = song_to_string;
module.exports.string_to_song = string_to_song;
module.exports.Tone = Tone;
module.exports.TonePin = TonePin;
module.exports.BarPattern = BarPattern;
