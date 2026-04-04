const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('coming-soon', { page: 'rating', title: 'Rating' });
});

module.exports = router;
