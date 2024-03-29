/* eslint-disable camelcase */
const Paystack = require('paystack-api')(process.env.PAYSTACK_SECRET_KEY);
const { translateError } = require('../utils/mongo_helper');
const { v4: uuidv4 } = require('uuid');
const WalletModel = require('../models/wallet.model');
const UserModel = require('../models/user.model');

class Wallet {
  constructor(email) {
    this.email = email;
  }

  //Private
  async #storeTransaction(
    referenceId,
    transactionType,
    operationType,
    amount,
    fundRecipientAccount,
    accessCode
  ) {
    const newTransaction = new WalletModel({
      referenceId,
      transactionType,
      operationType,
      amount,
      fundRecipientAccount,
      accessCode,
    });

    if (await newTransaction.save()) {
      return [true, newTransaction];
    }
    return [false];
  }

  async setPin(pin) {
    const updatedUser = await UserModel.findOneAndUpdate(
      { email: this.email },
      { pin },
      { new: true }
    ).select('pin');

    if (updatedUser) {
      return [true, updatedUser];
    }
    return [false];
  }

  async #updateTransaction(referenceId, status, processingFees, authorization) {
    const updatedTransaction = await WalletModel.findOneAndUpdate(
      { referenceId },
      { status, processingFees, authorization },
      { new: true }
    );

    if (updatedTransaction) {
      return updatedTransaction;
    }
    return null;
  }

  async initializePaystackCheckout(amount, userId) {
    const helper = new Paystack.FeeHelper();
    const amountPlusPaystackFees = helper.addFeesTo(amount * 100);
    const splitAccountFees = (1 / 100) * amount * 100;

    const result = await Paystack.transaction.initialize({
      email: this.email,
      //If amount is less than NGN2500, waive paystack's NGN100 charge to NGN10
      amount:
        amount >= 2500
          ? Math.ceil(amountPlusPaystackFees + 15000 + splitAccountFees)
          : Math.ceil(amountPlusPaystackFees + 1000 + splitAccountFees),
      reference: uuidv4(),
      currency: 'NGN',
      subaccount: process.env.PAYSTACK_SUB_ACCT,
    });

    if (!result) {
      return [false, result];
    }

    const newTransaction = await this.#storeTransaction(
      result.data.reference,
      'Fund',
      'Credit',
      amount,
      userId,
      result.data.access_code
    );
    if (newTransaction) {
      return [true, result.data];
    }
  }

  async verifyTransaction(reference) {
    try {
      const result = await Paystack.transaction.verify({
        reference,
      });
      if (!result) {
        return [false];
      }

      const { paystack, subaccount } = result.data.fees_split;
      const totalProcessingFees = paystack + subaccount;

      const updatedTransaction = await this.#updateTransaction(
        reference,
        result.data.status,
        totalProcessingFees,
        result.data.authorization
      );

      if (updatedTransaction) {
        return [true, updatedTransaction];
      }

      return [false];
    } catch (error) {
      return [false];
    }
  }

  async transferFund(
    pin,
    amount,
    fundRecipientAccountTag,
    comment,
    fundOriginatorAccount,
    senderTag
  ) {
    const foundRecipient = await UserModel.findOne({
      username: fundRecipientAccountTag,
    }).select('username');
    if (!foundRecipient) {
      return [false, 'Invalid recipient account'];
    }

    if (
      (await this.calculateWalletBalance(fundOriginatorAccount)) <=
      Number(amount) + 100
    ) {
      return [false, 'Error - Insufficient funds'];
    }

    if (await this.#validatePin(pin, fundOriginatorAccount)) {
      // include step to validate user balance!!!

      const newTransaction = new WalletModel({
        fundRecipientAccount: foundRecipient._id,
        fundOriginatorAccount,
        amount,
        operationType: 'Debit',
        transactionType: 'Transfer',
        status: 'Success',
        referenceId: uuidv4(),
        comment,
        recepientTag: fundRecipientAccountTag,
        senderTag,
      });

      if (await newTransaction.save()) {
        return [true, newTransaction];
      }
      return [false, 'Error - Unable to process transfer'];
    } else {
      return [false, 'Error - Incorrect transaction pin'];
    }
  }

  async calculateWalletBalance(id) {
    // Transactions were the user is a fund recipient.
    const recipientTransactons = await WalletModel.find({
      fundRecipientAccount: id,
    });
    //Transactions where user is fund originator
    const originatorTransactions = await WalletModel.find({
      fundOriginatorAccount: id,
    });

    let totalCredits = 0.0;
    let totalDebits = 0.0;

    if (recipientTransactons && originatorTransactions) {
      recipientTransactons.forEach((transaction) => {
        if (
          transaction.status === 'success' ||
          transaction.status === 'Success'
        )
          totalCredits = totalCredits + transaction.amount;
      });
      originatorTransactions.forEach((transaction) => {
        if (
          transaction.status === 'success' ||
          transaction.status === 'Success'
        )
          totalDebits = totalDebits + transaction.amount;
      });
    }
    return totalCredits - totalDebits;
  }

  async #validatePin(formPin, id) {
    const foundUser = await UserModel.findById(id).select('pin');
    if (foundUser.pin === formPin) {
      return true;
    }
    return false;
  }

  async getUserTransactions(id) {
    try {
      const transactions = await WalletModel.find({
        $or: [{ fundRecipientAccount: id }, { fundOriginatorAccount: id }],
        // $or: [{ status: 'Success' }, { status: 'success' }],
      }).sort({ createdAt: -1 });
      return [true, transactions];
    } catch (error) {
      return [false, translateError(error)];
    }
  }

  async getTransaction(transactionId) {
    try {
      const transaction = await WalletModel.findById(transactionId);
      if (transaction) {
        return [true, transaction];
      }
      return [false, 'Transaction not found'];
    } catch (error) {
      return [false, translateError(error)];
    }
  }

  async getPaystackBankLists() {
    try {
      const banks = await Paystack.misc.list_banks({
        country: 'nigeria',
        use_cursor: true,
        perPage: 100,
      });
      if (banks) {
        return [true, banks.data];
      }
      return [false];
    } catch (error) {
      return [false, error.error.message];
    }
  }

  async resolveBankAccount(account_number, bank_code) {
    try {
      const accountDetails = await Paystack.verification.resolveAccount({
        account_number,
        bank_code,
      });
      if (accountDetails) {
        return [true, accountDetails.data];
      }
      return [false];
    } catch (error) {
      return [false, error.error.message];
    }
  }

  async #createTransferRecipient(fullName, account_number, bank_code) {
    try {
      const recipient = await Paystack.transfer_recipient.create({
        type: 'nuban',
        name: fullName,
        account_number,
        bank_code,
        currency: 'NGN',
      });
      if (recipient) {
        return [true, recipient.data];
      }
    } catch (error) {
      return [false, error.error.message];
    }
  }

  async initializeTransfer(
    amount,
    reason,
    fullName,
    account_number,
    bank_code,
    pin,
    userId
  ) {
    try {
      // Create transaction recipient
      const check = await this.#createTransferRecipient(
        fullName,
        account_number,
        bank_code
      );

      //if transaction recipient is created
      if (check[0]) {
        //Validate transaction pin
        if (!(await this.#validatePin(pin, userId))) {
          return [false, 'Error - Incorrect transaction pin'];
        }

        //check if user has sufficient founds
        if (
          (await this.calculateWalletBalance(userId)) <=
          Number(amount) + 100
        ) {
          return [false, 'Error - Insufficient funds'];
        }

        //Initiate paystack transfer request
        const withdrawRequest = await Paystack.transfer.create({
          source: 'balance',
          amount: Number(amount) * 100 + 15 * 100, //Charge an extra 15 naira for processing fee.
          recipient: check[1].recipient_code,
          reason,
        });
        if (withdrawRequest) {
          //Create trasaction record on DB
          const newTransaction = new WalletModel({
            transactionType: 'Withdrawal',
            referenceId: withdrawRequest.data.reference,
            operationType: 'Debit',
            status: 'Success',
            processingFees: 15 * 100,
            amount: Number(amount) + 15,
            comment: reason,
            fundOriginatorAccount: userId,
            bankDetails: check[1].details,
          });
          if (await newTransaction.save()) {
            return [true, newTransaction];
            // return [true, withdrawRequest.data];
          }
          return [false, 'Error - unable to process withdraw request'];
        }
      } else {
        return [false, check[1] || 'Unable to resolve account number'];
      }
    } catch (error) {
      return [false, error.error.message || error];
    }
  }
}

module.exports = Wallet;
