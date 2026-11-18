import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomScene } from '../client/src/room/scene.js';
import { roomView } from '../client/src/room/scene-model.js';

const pointer = (x, y, options) => ({ clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: 0, ...options });

function makeScene() {
  const views = [], selections = [];
  const scene = Object.assign(Object.create(RoomScene.prototype), {
    canvas: { style: {}, clientWidth: 800, clientHeight: 400, getBoundingClientRect: () => ({ width: 800, height: 400 }) },
    view: roomView(), targetAt: () => ({ kind: 'pet' }), render() {},
    onViewChange: view => views.push(view), onSelect: target => selections.push(target),
  });
  return { scene, views, selections };
}

test('desktop orbit and pan move the view immediately, publish on release, and leave taps selectable', () => {
  const { scene, views, selections } = makeScene();
  const start = pointer(300, 150), end = pointer(380, 190);
  scene.pointerDown(start); scene.pointerMove(end);
  assert.equal(scene.view.rotation, -18); assert.equal(scene.view.tilt, 6);
  assert.equal(views.length, 0);
  scene.pointerUp(end); assert.equal(views[0], scene.view); assert.equal(selections.length, 0);
  scene.pointerDown(start); scene.pointerMove(pointer(302, 151)); scene.pointerUp(start);
  assert.deepEqual(selections, [{ kind: 'pet' }]);

  for (const options of [{ shiftKey: true }, { button: 2 }]) {
    scene.setView(roomView());
    scene.pointerDown(pointer(300, 150, options)); scene.pointerMove(end); scene.pointerUp(pointer(380, 190, options));
    assert.deepEqual(scene.view, roomView({ panX: -0.2, panY: 0.2 }));
  }
  scene.pointerDown(pointer(300, 150, { button: 2 })); scene.pointerUp(pointer(300, 150, { button: 2 }));
  assert.equal(selections.length, 1, 'secondary clicks do not interact with furnishings');
});

test('touch scrolls at the default view and the explicit camera modes take precedence over furniture', () => {
  const { scene, selections } = makeScene();
  const touch = (x, y) => pointer(x, y, { pointerType: 'touch' });
  scene.touchMode();
  assert.equal(scene.canvas.style.touchAction, 'pan-y');
  scene.pointerDown(touch(100, 100)); scene.pointerMove(touch(100, 140)); scene.pointerUp(touch(100, 140));
  assert.deepEqual(scene.view, roomView()); assert.deepEqual(selections, []);
  scene.editing = true;
  scene.targetAt = () => ({ kind: 'couch' });
  scene.onMoveFurniture = () => assert.fail('camera drag moved a furnishing');
  scene.setCameraMode('pan');
  assert.equal(scene.canvas.style.touchAction, 'none');
  scene.pointerDown(touch(100, 100)); scene.pointerMove(touch(180, 140)); scene.pointerUp(touch(180, 140));
  assert.deepEqual(scene.view, roomView({ panX: -0.2, panY: 0.2 }));
  scene.setCameraMode('orbit');
  scene.pointerDown(touch(100, 100)); scene.pointerMove(touch(180, 140)); scene.pointerUp(touch(180, 140));
  assert.equal(scene.view.rotation, -18); assert.equal(scene.view.tilt, 6);
  scene.pointerDown(touch(100, 100)); scene.pointerUp(touch(100, 100));
  assert.deepEqual(selections, [{ kind: 'couch' }]);

  scene.editing = false; scene.setCameraMode(null); scene.setView(roomView({ zoom: 2 }));
  scene.pointerDown(touch(100, 100)); scene.pointerMove(touch(180, 140)); scene.pointerUp(touch(180, 140));
  assert.deepEqual(scene.view, roomView({ zoom: 2, panX: -0.1, panY: 0.1 }), 'zoomed touch keeps its drag-to-pan gesture');
});

test('discrete steps share the drag bounds and an external reset supersedes a captured gesture', () => {
  const { scene, views } = makeScene();
  assert.equal(scene.stepCamera('ArrowLeft'), false);
  scene.setCameraMode('orbit'); scene.stepCamera('ArrowUp'); scene.stepCamera('ArrowLeft');
  assert.equal(scene.view.tilt, 5); assert.equal(scene.view.rotation, -15);
  scene.setCameraMode('pan'); scene.stepCamera('ArrowRight'); scene.stepCamera('ArrowDown');
  assert.equal(scene.view.panX, 0.24); assert.equal(scene.view.panY, -0.24);
  scene.pointerDown(pointer(300, 150)); scene.pointerMove(pointer(350, 150));
  scene.setView(roomView()); scene.pointerUp(pointer(350, 150));
  assert.deepEqual(scene.view, roomView());
  assert.equal(views.length, 4, 'the outgoing drag cannot overwrite the reset');
});
