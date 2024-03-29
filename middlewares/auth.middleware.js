const jwt = require('jsonwebtoken');
const Customer = require('../models/user.model');
const AdminModel = require('../models/admin.model');

const verifyUserToken = async (req, res, next) => {
  const bearerHeader = req.headers['authorization'];

  if (bearerHeader !== undefined) {
    const token = bearerHeader.split(' ')[1];
    try {
      const decode = jwt.verify(token, process.env.JWT_SECRET);
      const { exp, id } = decode;

      const foundUser = await Customer.findById(id);
      if (!foundUser) {
        return res.status(403).json({
          error: true,
          message: 'User not found',
        });
      }

      if (exp < Date.now()) {
        req.id = id;
        req.email = foundUser.email;
        next();
      } else {
        return res.status(403).json({
          error: true,
          message: 'Session expired',
        });
      }
    } catch (error) {
      console.error(error);
      return res.status(403).json({
        error: true,
        message: 'Invalid token',
      });
    }
  } else {
    return res.status(403).json({
      error: true,
      message: 'No authorization token found',
    });
  }
};

const verifyAdminToken = async (req, res, next) => {
  const bearerHeader = req.headers['authorization'];

  if (bearerHeader !== undefined) {
    const token = bearerHeader.split(' ')[1];
    try {
      const decode = jwt.verify(token, process.env.JWT_SECRET);
      const { exp, id } = decode;

      const foundAdmin = await AdminModel.findById(id);
      if (!foundAdmin) {
        return res.status(403).json({
          error: true,
          message: 'User not found',
        });
      }

      if (exp < Date.now()) {
        req.id = id;
        req.email = foundAdmin.email;
        next();
      } else {
        return res.status(403).json({
          error: true,
          message: 'Session expired',
        });
      }
    } catch (error) {
      console.error(error);
      return res.status(403).json({
        error: true,
        message: 'Invalid token',
      });
    }
  } else {
    return res.status(403).json({
      error: true,
      message: 'No authorization token found',
    });
  }
};

module.exports = {
  verifyUserToken,
  verifyAdminToken,
};
