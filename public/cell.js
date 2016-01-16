var cell_odom = 0;

function Cell(f) {
  this.f = f;
  this.dirty = true;
  this.gen = 0;
  this.sub = {};
  this.id = cell_odom++;
}

Cell.prototype.val = function() {
  if (this.dirty) {
    this.gen++;
    this.cache = this.f(this.get.bind(this));
    this.dirty = false;
  }
  return this.cache;
}

Cell.prototype.invalidate = function() {
  this.dirty = true;
  _.each(this.sub, function(w) {
    if (w.target.gen == w.gen && !w.target.dirty) {
      w.target.invalidate();
    }
  });
  this.sub = {};
}

Cell.prototype.set = function(x) {
  this.gen++;
  this.f = function() { return x; };
  this.invalidate();
}

Cell.prototype.get = function(them) {
  them.sub[this.id] = {gen: this.gen, target: this};
  return them.val();
}


function Root(x) {
  this.cache = x;
  this.sub = {};
  this.id = cell_odom++;
}

Root.prototype.val = function() {
  return this.cache;
}

Root.prototype.invalidate = function() {
  _.each(this.sub, function(w) {
    if (w.target.gen == w.gen && !w.target.dirty) {
      w.target.invalidate();
    }
  });
  this.sub = {};
}

Root.prototype.set = function(x) {
  this.cache = x;
  this.invalidate();
}
