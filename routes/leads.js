const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('coming-soon', { page: 'leads', title: 'Leads' });
});

module.exports = router;
