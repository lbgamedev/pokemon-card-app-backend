// authMiddleware.js
require('dotenv').config();
const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    const token = req.header('Authorization')?.split(' ')[1];
    if (!token) {
        return res.status(401).send('Access denied. No token provided.');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Attach the decoded user information to the request
        next(); // Continue to the next middleware or route handler
    } catch (err) {
        res.status(401).send('Invalid token');
    }
};

// Middleware to check if the user is an admin
const adminMiddleware = (req, res, next) => {
  if (req.user && req.user.isAdmin) {
    next(); // Proceed if user is admin
  } else {
    res.status(403).send('Forbidden: Admin access only');
  }
};

module.exports = { authMiddleware, adminMiddleware };
