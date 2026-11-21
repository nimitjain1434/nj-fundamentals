"use strict";

// [label, low-score value, high-score value, unit].
// Endpoints and grades are synthetic and demonstrate the scoring interface.
const scorecards = {
  "IT services": { weights: [30, 25, 20, 25], metrics: [
    ["Operating margin", 12, 28, "%"], ["3-year EPS growth", 2, 18, "%"],
    ["Cash conversion", 60, 110, "%"], ["Trailing P/E", 36, 14, "×"]
  ] },
  Banks: { weights: [25, 15, 35, 25], metrics: [
    ["Return on assets", 0.5, 2.5, "%"], ["Loan growth", 4, 22, "%"],
    ["Net non-performing loans", 2.5, 0.2, "%"], ["Price-to-book per 10% ROE", 3, 0.7, "×"]
  ] },
  "Metals & mining": { weights: [25, 15, 30, 30], metrics: [
    ["5-year median operating margin", 5, 28, "%"], ["3-year revenue growth", 0, 20, "%"],
    ["Net debt / EBITDA", 5, 0.2, "×"], ["Mid-cycle EV / EBITDA", 14, 4, "×"]
  ] },
  Insurance: { weights: [30, 25, 25, 20], metrics: [
    ["New business margin", 12, 35, "%"], ["New business value growth", 1, 24, "%"],
    ["Solvency ratio", 150, 260, "%"], ["Price / embedded value", 5, 1, "×"]
  ] },
  "Non-bank lenders": { weights: [25, 20, 35, 20], metrics: [
    ["Return on assets", 0.6, 4.4, "%"], ["Loan book growth", 3, 26, "%"],
    ["Net non-performing loans", 3, 0.3, "%"], ["Price-to-book per 10% ROE", 4, 0.7, "×"]
  ] },
  "General corporate": { weights: [30, 20, 25, 25], metrics: [
    ["Return on invested capital", 4, 26, "%"], ["3-year revenue growth", 0, 23, "%"],
    ["Interest coverage", 1, 16, "×"], ["Trailing P/E", 44, 10, "×"]
  ] }
};

// Ticker, display name, screener sector, four demo grades, optional model.
const stockSeeds = [
  ["ADANIENT", "Adani Enterprises", "Diversified", [58, 75, 48, 44]],
  ["ADANIPORTS", "Adani Ports & SEZ", "Infrastructure", [81, 84, 69, 65]],
  ["APOLLOHOSP", "Apollo Hospitals", "Healthcare", [81, 89, 78, 59]],
  ["ASIANPAINT", "Asian Paints", "Consumer", [84, 58, 91, 51]],
  ["AXISBANK", "Axis Bank", "Banks", [79, 72, 81, 78]],
  ["BSE", "BSE", "Financial services", [88, 92, 91, 52]],
  ["BAJAJ-AUTO", "Bajaj Auto", "Automobiles", [91, 82, 93, 74]],
  ["BAJFINANCE", "Bajaj Finance", "Financial services", [91, 95, 85, 61], "Non-bank lenders"],
  ["BAJAJFINSV", "Bajaj Finserv", "Financial services", [78, 81, 71, 58]],
  ["BEL", "Bharat Electronics", "Industrials", [85, 90, 96, 60]],
  ["BHARTIARTL", "Bharti Airtel", "Telecom", [85, 88, 80, 76]],
  ["CIPLA", "Cipla", "Healthcare", [82, 76, 94, 76]],
  ["COALINDIA", "Coal India", "Energy", [85, 51, 93, 91]],
  ["DRREDDY", "Dr. Reddy’s Laboratories", "Healthcare", [82, 66, 91, 83]],
  ["EICHERMOT", "Eicher Motors", "Automobiles", [90, 83, 93, 72]],
  ["ETERNAL", "Eternal", "Consumer", [56, 98, 80, 36]],
  ["GRASIM", "Grasim Industries", "Cement", [63, 77, 58, 59]],
  ["HCLTECH", "HCL Technologies", "IT services", [85, 78, 92, 77]],
  ["HDFCBANK", "HDFC Bank", "Banks", [88, 76, 93, 85]],
  ["HDFCLIFE", "HDFC Life Insurance", "Financial services", [79, 82, 84, 64], "Insurance"],
  ["HINDALCO", "Hindalco Industries", "Metals & mining", [79, 74, 77, 88]],
  ["HINDUNILVR", "Hindustan Unilever", "FMCG", [86, 53, 93, 59]],
  ["ICICIBANK", "ICICI Bank", "Banks", [96, 86, 95, 85]],
  ["ITC", "ITC", "FMCG", [92, 61, 97, 85]],
  ["INFY", "Infosys", "IT services", [91, 80, 96, 76]],
  ["INDIGO", "InterGlobe Aviation", "Services", [75, 86, 51, 59]],
  ["JSWSTEEL", "JSW Steel", "Metals & mining", [65, 79, 52, 59]],
  ["JIOFIN", "Jio Financial Services", "Financial services", [56, 79, 85, 43], "Non-bank lenders"],
  ["KOTAKBANK", "Kotak Mahindra Bank", "Banks", [85, 66, 93, 75]],
  ["LT", "Larsen & Toubro", "Industrials", [81, 87, 76, 71]],
  ["M&M", "Mahindra & Mahindra", "Automobiles", [89, 93, 81, 73]],
  ["MARUTI", "Maruti Suzuki India", "Automobiles", [86, 76, 94, 67]],
  ["MAXHEALTH", "Max Healthcare", "Healthcare", [81, 89, 78, 51]],
  ["NTPC", "NTPC", "Power", [76, 62, 71, 83]],
  ["NESTLEIND", "Nestlé India", "FMCG", [91, 66, 94, 44]],
  ["ONGC", "Oil & Natural Gas Corporation", "Energy", [75, 56, 78, 89]],
  ["POWERGRID", "Power Grid Corporation", "Power", [77, 56, 75, 86]],
  ["RELIANCE", "Reliance Industries", "Energy", [83, 78, 76, 80]],
  ["SBILIFE", "SBI Life Insurance", "Financial services", [87, 79, 89, 67], "Insurance"],
  ["SHRIRAMFIN", "Shriram Finance", "Financial services", [79, 78, 75, 81], "Non-bank lenders"],
  ["SBIN", "State Bank of India", "Banks", [81, 74, 86, 94]],
  ["SUNPHARMA", "Sun Pharmaceutical", "Healthcare", [89, 87, 94, 64]],
  ["TCS", "Tata Consultancy Services", "IT services", [96, 79, 98, 83]],
  ["TATACONSUM", "Tata Consumer Products", "FMCG", [72, 79, 79, 53]],
  ["TMPV", "Tata Motors Passenger Vehicles", "Automobiles", [56, 62, 61, 66]],
  ["TATASTEEL", "Tata Steel", "Metals & mining", [58, 63, 53, 76]],
  ["TECHM", "Tech Mahindra", "IT services", [67, 72, 86, 69]],
  ["TITAN", "Titan Company", "Consumer", [89, 86, 79, 47]],
  ["TRENT", "Trent", "Consumer", [87, 96, 86, 47]],
  ["ULTRACEMCO", "UltraTech Cement", "Cement", [81, 82, 69, 62]]
];
