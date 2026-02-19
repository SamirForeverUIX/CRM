const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('groups/index', { page: 'groups' });
});

module.exports = router;
