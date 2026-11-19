// Port Solano — keyboard and mouse input.
// Tracks held keys, edge-triggered presses, and mouse drag for the camera.
// Pointer lock is requested on canvas click for aiming; drag still works
// without it, so the game stays playable in every browser.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.locked = false;
    this.onFirstGesture = null;
    this._gestured = false;

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      this._gesture();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true;
      this.mouseClicked = true;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this._gesture();
      if (canvas.requestPointerLock) canvas.requestPointerLock();
    });
    window.addEventListener('mouseup', () => { this.mouseDown = false; this.dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      } else if (this.dragging) {
        this.mouseDX += e.clientX - this.lastX;
        this.mouseDY += e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
  }

  _gesture() {
    if (!this._gestured) {
      this._gestured = true;
      if (this.onFirstGesture) this.onFirstGesture();
    }
  }

  down(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }

  // Call once per frame: returns accumulated mouse delta and clears it.
  consumeMouse() {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0;
    return { dx, dy };
  }

  consumeClick() {
    const c = this.mouseClicked;
    this.mouseClicked = false;
    return c;
  }

  endFrame() { this.pressed.clear(); }

  // WASD + arrows as a -1..1 drive/strafe pair.
  axes() {
    let x = 0, y = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    return { x, y };
  }
}
