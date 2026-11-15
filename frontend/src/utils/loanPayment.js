import { roundMoney } from './transactionLedger.js';
export function calculateLoanPayment(loan, amount, date) {
  const baseline=loan.last_interest_calc_date||loan.start_date;
  if(date<baseline) throw new Error('Payment date precedes the last interest calculation');
  if(!Number.isFinite(amount)||amount<=0) throw new Error('Enter a positive payment');
  const days=Math.max(0,Math.floor((Date.parse(date)-Date.parse(baseline))/86400000));
  const interest=roundMoney((loan.unpaid_interest||0)+loan.principal_amount*(loan.annual_interest_rate||0)/100/365*days);
  if(amount>roundMoney(loan.principal_amount+interest)+0.01) throw new Error('Payment exceeds the outstanding balance');
  const paidInterest=Math.min(amount,interest);
  const rawPrincipal=roundMoney(Math.max(0,loan.principal_amount-(amount-paidInterest)));
  const principal=rawPrincipal<=0.01?0:rawPrincipal;
  return {principal_amount:principal,unpaid_interest:roundMoney(Math.max(0,interest-paidInterest)),
    total_interest_paid:roundMoney((loan.total_interest_paid||0)+paidInterest),last_interest_calc_date:date,
    last_paid_month:date.slice(0,7),status:principal<=0?'Paid':'Active'};
}
