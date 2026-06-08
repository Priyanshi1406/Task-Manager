const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const auth = require('../middleware/auth');

// GET all tasks for logged-in user
router.get('/', auth, async (req, res) => {
  try {
    const tasks = await Task.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create task
router.post('/', auth, async (req, res) => {
  try {
    const { title, description, status, priority, dueDate } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const task = new Task({ user: req.user._id, title, description, status, priority, dueDate });
    await task.save();

    // Emit realtime event
    const io = req.app.get('io');
    if (io) io.emit('taskCreated', task);

    res.status(201).json(task);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT update task
router.put('/:id', auth, async (req, res) => {
  try {
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      req.body,
      { new: true }
    );
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const io = req.app.get('io');
    if (io) io.emit('taskUpdated', task);

    res.json(task);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE task
router.delete('/:id', auth, async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const io = req.app.get('io');
    if (io) io.emit('taskDeleted', { id: req.params.id });

    res.json({ message: 'Task deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
