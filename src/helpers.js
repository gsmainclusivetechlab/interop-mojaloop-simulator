exports.isInRange = (amount = 0, range = []) => {
  if (!amount || !range) {
    return
  }

  const [from, to] = range.split('-')

  return parseFloat(amount) >= parseFloat(from) && parseFloat(amount) <= parseFloat(to)
}

exports.isRejectedTransactionFlow = (amount) => {
  return this.isInRange(amount, process.env.AMOUNT_RANGE_FOR_REJECTED_TRANSACTION_FLOW)
}

exports.isOTPVerificationFlow = (amount) => {
  return this.isInRange(amount, process.env.AMOUNT_RANGE_FOR_OTP_VERIFICATION_FLOW)
}
