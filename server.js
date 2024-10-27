require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');
const app = express();
const cors = require('cors');  // Import cors
const { authMiddleware, adminMiddleware } = require('./authMiddleware');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
app.use(cors());
app.use(express.json());

// PostgreSQL configuration
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});


// Register endpoint
app.post('/api/register', [
    body('username').notEmpty(),
    body('password').isLength({ min: 6 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id',
            [username, hashedPassword]
        );
        res.status(201).json({ userId: result.rows[0].id });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error');
    }
});

// Login endpoint
app.post('/api/login', [
    body('username').notEmpty(),
    body('password').notEmpty()
], async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ message: 'Ungültige Anmeldedaten' });
        }
        const token = jwt.sign({ userId: user.id, isAdmin: user.isadmin }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error');
    }
});

// API Route: Fetch Pokémon cards from Twilight Masquerade set
app.get('/api/cards', authMiddleware, async (req, res) => {
  try {
    const response = await axios.get('https://api.pokemontcg.io/v2/cards?q=set.name:"Twilight Masquerade"');
    const cards = response.data.data

    // Step 2: Fetch ownership information from the database
    const { rows: ownershipData } = await pool.query(
        'SELECT card_id, owns, copies FROM user_cards WHERE user_id = $1',
        [req.user.userId]
    );

    const ownershipMap = {};
    ownershipData.forEach(ownership => {
        ownershipMap[ownership.card_id] = ownership;
    });
    // console.log(cards)
    // try {
    //     const enrichedCards = cards.map(card => {
    //         console.log(card)
    //     })
    // } catch(e){
    //     console.log(e)
    // }
    const enrichedCards = cards.map(card => {
        const ownership = ownershipMap[card.id] || { owns: false, copies: 0 }; // Default ownership
        return {
            ...card,
            owns: ownership.owns,
            copies: ownership.copies
        };
    });
    res.json(enrichedCards);
  } catch (err) {
    res.status(500).send('Error fetching cards');
  }
});

// API Route: Fetch Pokémon cards from Twilight Masquerade set
app.get('/api/cards/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
      const response = await axios.get(`https://api.pokemontcg.io/v2/cards/${id}`);
      res.json(response.data);
    } catch (err) {
      res.status(500).send('Error fetching cards');
    }
  });

// API Route: Fetch ownership details of a card for a specific user
app.get('/api/cards/:id/ownership', authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('SELECT owns, copies FROM user_cards WHERE user_id = $1 AND card_id = $2', [req.user.userId, id]);
    res.json(result.rows[0] || { owns: false, copies: 0 });
  } catch (err) {
    res.status(500).send('Error fetching ownership details');
  }
});

// API Route: Set ownership details of a card
app.post('/api/cards/:id/ownership', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { owns, copies } = req.body;
  try {
    await pool.query(
      'INSERT INTO user_cards (user_id, card_id, owns, copies) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, card_id) DO UPDATE SET owns = $3, copies = $4',
      [req.user.userId, id, owns, copies]
    );
    res.status(200).json({ message: "Änderungen gespeichert" });
  } catch (err) {
    res.status(500).send('Error updating ownership');
  }
});

// Route to reset password (only accessible by admins)
app.post('/api/admin/reset-password', authMiddleware, adminMiddleware, async (req, res) => {
    const { username, newPassword } = req.body;
  
    if (!username || !newPassword) {
      return res.status(400).json({ message: 'Username and new password are required' });
    }
  
    try {
      // Hash the new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
  
      // Update the user's password in the database
      await pool.query('UPDATE users SET password = $1 WHERE username = $2', [hashedPassword, username]);
  
      res.status(200).json({ message: 'Password reset successful' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Failed to reset password' });
    }
  });

// Start the server
app.listen(3005, () => {
  console.log('Server running on port 3005');
});
