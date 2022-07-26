const User = require('../services/user.service');
const { responseHandler } = require('../utils/responseHandler');
const { setupTagValidation } = require('../validations/user.validation');

const setupAccountTag = async (req, res) => {
  try {
    const { details } = await setupTagValidation(req.body);
    if (details) {
      let allErrors = details.map((detail) => detail.message.replace(/"/g, ''));
      return responseHandler(res, allErrors, 400, true, '');
    }

    const user = new User(req.email);
    const check = await user.updateUsername(req.id, req.body.accountTag);
    if (check[0]) {
      return responseHandler(
        res,
        'Account tag setup successful',
        201,
        false,
        check[1]
      );
    }
    return responseHandler(res, check[1], 400, true, '');
  } catch (error) {
    return responseHandler(
      res,
      'An error occured. Try again',
      500,
      true,
      error
    );
  }
};

const verifyAvailableUsername = async (req, res) => {
  try {
    if (req.params.username === undefined) {
      return responseHandler(
        res,
        'Invalid request. Include username',
        400,
        true,
        ''
      );
    }

    const user = new User(req.email);
    const check = await user.findByUsername(req.params.username);
    if (check[0]) {
      return responseHandler(res, 'Account tag available', 200, false, '');
    }
    return responseHandler(
      res,
      check[1] || 'Account tag unavailable',
      400,
      true,
      ''
    );
  } catch (error) {
    return responseHandler(
      res,
      'An error occured. Try again',
      500,
      true,
      error
    );
  }
};

module.exports = {
  setupAccountTag,
  verifyAvailableUsername,
};