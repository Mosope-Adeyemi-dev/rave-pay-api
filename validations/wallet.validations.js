const Joi = require('joi');

const fundWalletValidation = async (field) => {
  const schema = Joi.object({
    amount: Joi.number().required(),
  });
  try {
    return await schema.validateAsync(field, { abortEarly: false });
  } catch (err) {
    return err;
  }
};

const transferFundsValidation = async (field) => {
  const schema = Joi.object({
    pin: Joi.string().min(4).max(4).required(),
    amount: Joi.number().required(),
    comment: Joi.string(),
    recipientAccountTag: Joi.string().min(6).required(),
  });
  try {
    return await schema.validateAsync(field, { abortEarly: false });
  } catch (err) {
    return err;
  }
};

const setPinValidation = async (field) => {
  const schema = Joi.object({
    pin: Joi.string().min(4).max(4).required(),
    confirmPin: Joi.ref('pin'),
  });
  try {
    return await schema.validateAsync(field, { abortEarly: false });
  } catch (err) {
    return err;
  }
};

module.exports = {
  setPinValidation,
  fundWalletValidation,
  transferFundsValidation,
};
