require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');
const app = express();
const cors = require('cors');  // Import cors
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

// API Route: Fetch Pokémon cards from Twilight Masquerade set
app.get('/api/cards', async (req, res) => {
  try {
    const response = await axios.get('https://api.pokemontcg.io/v2/cards?q=set.name:"Twilight Masquerade"');
    const cards = response.data.data

    // Step 2: Fetch ownership information from the database
    const { rows: ownershipData } = await pool.query(
        'SELECT card_id, owns, copies FROM user_cards WHERE user_id = $1',
        ['1']
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
app.get('/api/cards/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const response = await axios.get(`https://api.pokemontcg.io/v2/cards/${id}`);
      res.json(response.data);
    } catch (err) {
      res.status(500).send('Error fetching cards');
    }
  });

// API Route: Fetch ownership details of a card for a specific user
app.get('/api/cards/:id/ownership', async (req, res) => {
  const { id } = req.params;
  const { userId } = req.query;

  try {
    const result = await pool.query('SELECT owns, copies FROM user_cards WHERE user_id = $1 AND card_id = $2', [userId, id]);
    res.json(result.rows[0] || { owns: false, copies: 0 });
  } catch (err) {
    res.status(500).send('Error fetching ownership details');
  }
});

// API Route: Set ownership details of a card
app.post('/api/cards/:id/ownership', async (req, res) => {
  const { id } = req.params;
  const { userId, owns, copies } = req.body;

  try {
    await pool.query(
      'INSERT INTO user_cards (user_id, card_id, owns, copies) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, card_id) DO UPDATE SET owns = $3, copies = $4',
      [userId, id, owns, copies]
    );
    res.status(200).json({ message: "Änderungen gespeichert" });
  } catch (err) {
    res.status(500).send('Error updating ownership');
  }
});

// Start the server
app.listen(3005, () => {
  console.log('Server running on port 3005');
});
