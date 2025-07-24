window.requestAnimFrame =
  window.requestAnimationFrame ||
  window.webkitRequestAnimationFrame ||
  window.mozRequestAnimationFrame ||
  window.oRequestAnimationFrame ||
  window.msRequestAnimationFrame ||
  function (callback) {
    window.setTimeout(callback, 1e3 / 60);
  };

let accuracy = 5;
let gravity = 400;
let clothY = 50;
let clothX = 50;
let spacing = 8;
let tearDist = 15;
let friction = 0.99;
let bounce = 0.5;
let image = "assets/sprites/balls.png";
let textureImage = null;
let textureLoaded = false;

let canvas = document.getElementById("canvas");
let ctx = canvas.getContext("2d");

function loadTexture() {
  textureLoaded = false;
  textureImage = new Image();
  textureImage.crossOrigin = "anonymous";
  textureImage.onload = function () {
    textureLoaded = true;
  };
  textureImage.src = image;
}

canvas.width = Math.min(700, window.innerWidth);
canvas.height = 400;

ctx.strokeStyle = "#555";

let mouse = {
  cut: 8,
  influence: 36,
  down: false,
  button: 1,
  x: 0,
  y: 0,
  px: 0,
  py: 0,
};

class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.px = x;
    this.py = y;
    this.vx = 0;
    this.vy = 0;
    this.pinX = null;
    this.pinY = null;

    this.constraints = [];
  }

  update(delta) {
    if (this.pinX && this.pinY) return this;

    if (mouse.down) {
      let dx = this.x - mouse.x;
      let dy = this.y - mouse.y;
      let dist = Math.sqrt(dx * dx + dy * dy);

      if (mouse.button === 1 && dist < mouse.influence) {
        this.px = this.x - (mouse.x - mouse.px);
        this.py = this.y - (mouse.y - mouse.py);
      } else if (dist < mouse.cut) {
        this.constraints = [];
      }
    }

    this.addForce(0, gravity);

    let nx = this.x + (this.x - this.px) * friction + this.vx * delta;
    let ny = this.y + (this.y - this.py) * friction + this.vy * delta;

    this.px = this.x;
    this.py = this.y;

    this.x = nx;
    this.y = ny;

    this.vy = this.vx = 0;

    if (this.x >= canvas.width) {
      this.px = canvas.width + (canvas.width - this.px) * bounce;
      this.x = canvas.width;
    } else if (this.x <= 0) {
      this.px *= -1 * bounce;
      this.x = 0;
    }

    if (this.y >= canvas.height) {
      this.py = canvas.height + (canvas.height - this.py) * bounce;
      this.y = canvas.height;
    } else if (this.y <= 0) {
      this.py *= -1 * bounce;
      this.y = 0;
    }

    return this;
  }

  draw() {
    let i = this.constraints.length;
    while (i--) this.constraints[i].draw();
  }

  resolve() {
    if (this.pinX && this.pinY) {
      this.x = this.pinX;
      this.y = this.pinY;
      return;
    }

    this.constraints.forEach((constraint) => constraint.resolve());
  }

  attach(point) {
    this.constraints.push(new Constraint(this, point));
  }

  free(constraint) {
    this.constraints.splice(this.constraints.indexOf(constraint), 1);
  }

  addForce(x, y) {
    this.vx += x;
    this.vy += y;
  }

  pin(pinx, piny) {
    this.pinX = pinx;
    this.pinY = piny;
  }
}

class Constraint {
  constructor(p1, p2) {
    this.p1 = p1;
    this.p2 = p2;
    this.length = spacing;
  }

  resolve() {
    let dx = this.p1.x - this.p2.x;
    let dy = this.p1.y - this.p2.y;
    let dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < this.length) return;

    let diff = (this.length - dist) / dist;

    if (dist > tearDist) this.p1.free(this);

    let mul = diff * 0.5 * (1 - this.length / dist);

    let px = dx * mul;
    let py = dy * mul;

    !this.p1.pinX && (this.p1.x += px);
    !this.p1.pinY && (this.p1.y += py);
    !this.p2.pinX && (this.p2.x -= px);
    !this.p2.pinY && (this.p2.y -= py);

    return this;
  }

  draw() {
    ctx.moveTo(this.p1.x, this.p1.y);
    ctx.lineTo(this.p2.x, this.p2.y);
  }
}

class Cloth {
  constructor(free) {
    this.points = [];

    let startX = canvas.width / 2 - (clothX * spacing) / 2;

    for (let y = 0; y <= clothY; y++) {
      for (let x = 0; x <= clothX; x++) {
        let point = new Point(startX + x * spacing, 20 + y * spacing);
        !free && y === 0 && point.pin(point.x, point.y);
        x !== 0 && point.attach(this.points[this.points.length - 1]);
        y !== 0 && point.attach(this.points[x + (y - 1) * (clothX + 1)]);

        this.points.push(point);
      }
    }
  }

  update(delta) {
    let i = accuracy;

    while (i--) {
      this.points.forEach((point) => {
        point.resolve();
      });
    }

    if (textureLoaded && textureImage) {
      this.drawTextured();
    } else {
      ctx.beginPath();
      this.points.forEach((point) => {
        point.update(delta * delta).draw();
      });
      ctx.stroke();
    }
  }

  /**
   * Renders a textured cloth mesh onto the canvas context (`ctx`) using the provided `textureImage`.
   *
   * This method iterates over a grid defined by `clothX` and `clothY`, updating each point's position,
   * and then draws each quad (composed of four points) as a clipped region. The corresponding portion
   * of the texture image is mapped onto each quad, creating a textured cloth effect.
   *
   * Assumes the following external/global variables are defined:
   * - `clothX`: Number of horizontal segments in the cloth grid.
   * - `clothY`: Number of vertical segments in the cloth grid.
   * - `ctx`: The 2D rendering context of the canvas.
   * - `textureImage`: The image to be used as the texture.
   *
   * Each point in `this.points` is expected to have `x`, `y` properties and an `update(dt)` method.
   *
   * @method drawTextured
   */
  drawTextured() {
    this.points.forEach((point) => {
      point.update(0.016 * 0.016);
    });

    for (let y = 0; y < clothY; y++) {
      for (let x = 0; x < clothX; x++) {
        // Get the four corner points of the current quad in the cloth grid
        let p1 = this.points[x + y * (clothX + 1)]; // Top-left
        let p2 = this.points[x + 1 + y * (clothX + 1)]; // Top-right
        let p3 = this.points[x + (y + 1) * (clothX + 1)]; // Bottom-left
        let p4 = this.points[x + 1 + (y + 1) * (clothX + 1)]; // Bottom-right

        if (p1 && p2 && p3 && p4) {
          // Check if any of the quad's points are missing constraints (torn cloth)
          if (
            p1.constraints.length === 0 ||
            p2.constraints.length === 0 ||
            p3.constraints.length === 0 ||
            p4.constraints.length === 0
          ) {
            continue; // Skip this quad if any point has no constraints
          }

          // Calculate the max distance between any two points in the quad
          let points = [p1, p2, p3, p4];
          let maxDist = 0;
          for (let i = 0; i < 4; i++) {
            for (let j = i + 1; j < 4; j++) {
              let dx = points[i].x - points[j].x;
              let dy = points[i].y - points[j].y;
              let dist = Math.sqrt(dx * dx + dy * dy);
              if (dist > maxDist) maxDist = dist;
            }
          }
          // Skip drawing this quad if the max distance is too large
          if (maxDist > 3 * spacing) continue;

          let overlap = 1; // Small overlap to hide grid lines
          let u1 = Math.max(0, (x - overlap * 0.02) / clothX);
          let v1 = Math.max(0, (y - overlap * 0.02) / clothY);
          let u2 = Math.min(1, (x + 1 + overlap * 0.02) / clothX);
          let v2 = Math.min(1, (y + 1 + overlap * 0.02) / clothY);

          // Expand quad boundaries slightly for overlap
          let centerX = (p1.x + p2.x + p3.x + p4.x) / 4;
          let centerY = (p1.y + p2.y + p3.y + p4.y) / 4;
          let expandFactor = 1.05; // 5% expansion

          let ep1x = centerX + (p1.x - centerX) * expandFactor;
          let ep1y = centerY + (p1.y - centerY) * expandFactor;
          let ep2x = centerX + (p2.x - centerX) * expandFactor;
          let ep2y = centerY + (p2.y - centerY) * expandFactor;
          let ep3x = centerX + (p3.x - centerX) * expandFactor;
          let ep3y = centerY + (p3.y - centerY) * expandFactor;
          let ep4x = centerX + (p4.x - centerX) * expandFactor;
          let ep4y = centerY + (p4.y - centerY) * expandFactor;

          ctx.save();
          ctx.beginPath();
          ctx.moveTo(ep1x, ep1y);
          ctx.lineTo(ep2x, ep2y);
          ctx.lineTo(ep4x, ep4y);
          ctx.lineTo(ep3x, ep3y);
          ctx.closePath();
          ctx.clip();

          let sx = u1 * textureImage.width;
          let sy = v1 * textureImage.height;
          let sw = (u2 - u1) * textureImage.width;
          let sh = (v2 - v1) * textureImage.height;

          let dx = Math.min(ep1x, ep2x, ep3x, ep4x);
          let dy = Math.min(ep1y, ep2y, ep3y, ep4y);
          let dw = Math.max(ep1x, ep2x, ep3x, ep4x) - dx;
          let dh = Math.max(ep1y, ep2y, ep3y, ep4y) - dy;

          if (sw > 0 && sh > 0 && dw > 0 && dh > 0) {
            ctx.drawImage(textureImage, sx, sy, sw, sh, dx, dy, dw, dh);
          }
          ctx.restore();
        }
      }
    }
  }
}

function setMouse(e) {
  let rect = canvas.getBoundingClientRect();
  mouse.px = mouse.x;
  mouse.py = mouse.y;
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
}

canvas.onmousedown = (e) => {
  mouse.button = e.which;
  mouse.down = true;
  setMouse(e);
};

canvas.onmousemove = setMouse;

canvas.onmouseup = () => (mouse.down = false);

canvas.oncontextmenu = (e) => e.preventDefault();

let cloth = new Cloth();
loadTexture();

function zeroG() {
  gravity = 0;
  cloth = new Cloth(true);
}

(function update(time) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  cloth.update(0.016);

  window.requestAnimFrame(update);
})(0);
