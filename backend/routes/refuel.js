const express = require('express');
const verifyToken = require('../middleware/verifyToken');
const validateObjectId = require('../middleware/validateObjectId');
const { body, validationResult } = require('express-validator');
const RefuelEntry = require('../models/RefuelEntry');

const router = express.Router();

// === JWT ellenőrzés middleware ===
router.use(verifyToken);

// === GET /api/refuel?carId=... – az adott autó bejegyzései ===
router.get('/', async (req, res) => {
  try {
    const { carId } = req.query;
    if (!carId) return res.status(400).json({ error: 'Hiányzó carId paraméter!' });

    const entries = await RefuelEntry.find({ userId: req.userId, carId });
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: 'Hiba a lekérdezés során!' });
  }
});

// === POST /api/refuel – új bejegyzés autóhoz ===
router.post(
  '/',
  [
    body('carId').notEmpty().withMessage('Az autó azonosítója (carId) kötelező!'),
    body('date')
      .isISO8601().toDate().withMessage('Érvénytelen dátum!')
      .custom(value => value <= new Date()).withMessage('A dátum nem lehet a mai napnál későbbi!'),
    body('odometer').isFloat({ min: 1 }).withMessage('A kilométeróra állása nem lehet negatív vagy nulla!'),
    body('liters').isFloat({ min: 0.1 }).withMessage('A liter értéke nem lehet negatív vagy nulla!'),
    body('unitPrice').isFloat({ min: 1 }).withMessage('Az egységár nem lehet negatív vagy nulla!'),
    body('location').optional().isString().trim()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { carId, odometer, liters, unitPrice } = req.body;
      const userId = req.userId;
      const price = Math.round(liters * unitPrice);

      // Fogyasztás számítása az utolsó bejegyzés alapján
      const lastEntry = await RefuelEntry.findOne({ userId, carId }).sort({ odometer: -1 });
      let consumption;
      if (lastEntry && lastEntry.odometer < odometer) {
        const distance = odometer - lastEntry.odometer;
        consumption = Math.round((liters / distance) * 100 * 100) / 100;
      }
      if (lastEntry && odometer <= lastEntry.odometer) {
        return res.status(400).json({
          errors: [{ msg: 'A kilométeróra állásnak nagyobbnak kell lennie az előző bejegyzéshez képest!' }]
        });
      }

      const newEntry = new RefuelEntry({ ...req.body, userId, price, consumption });
      const saved = await newEntry.save();
      res.status(201).json(saved);
    } catch (err) {
      res.status(400).json({ error: 'Hibás adat vagy mentési hiba!' });
    }
  }
);

// === GET /api/refuel/:id – egy bejegyzés lekérdezése ===
router.get(
  '/:id',
  validateObjectId('id'),
  async (req, res) => {
    try {
      const entry = await RefuelEntry.findOne({ _id: req.params.id, userId: req.userId });
      if (!entry) return res.status(404).json({ error: 'Nem található ilyen bejegyzés!' });
      res.json(entry);
    } catch (err) {
      res.status(500).json({ error: 'Hiba a lekérdezés során!' });
    }
  }
);

// === DELETE /api/refuel/:id – bejegyzés törlése ===
router.delete(
  '/:id',
  validateObjectId('id'),
  async (req, res) => {
    try {
      const deleted = await RefuelEntry.findOneAndDelete({ _id: req.params.id, userId: req.userId });
      if (!deleted) return res.status(404).json({ error: 'Nem található ilyen bejegyzés!' });
      res.json({ message: 'Bejegyzés törölve!', id: deleted._id });
    } catch (err) {
      res.status(500).json({ error: 'Törlési hiba!' });
    }
  }
);

module.exports = router;
