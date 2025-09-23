// Code.gs - Google Apps Script
const SPREADSHEET_ID = "1csHd-CROYbuRaZBW95oxvu8wu2t_1WrAMYPy4GbkD6k";
const PRODUCTS_SHEET = "Products";
const ORDERS_SHEET = "Orders";

/**
 * GET handler for:
 *  - ?action=products
 *  - ?action=getAllOrders
 *  - ?action=getOrders&phone=...
 *  - ?action=ping  (simple health check)
 */
function doGet(e) {
  const action = (e.parameter.action || "").toString().trim().toLowerCase();
  try {
    if (action === "products") return jsonOutput(getProducts());
    if (action === "getallorders") return jsonOutput(getAllOrders());
    if (action === "getorders" && e.parameter.phone) return jsonOutput(getOrdersByPhone(e.parameter.phone));
    if (action === "ping") return jsonOutput({ status: "ok" });
    return jsonOutput({ status: "error", message: "Invalid action. Use action=products|getAllOrders|getOrders&phone=..." });
  } catch (err) {
    return jsonOutput({ status: "error", message: err.toString() });
  }
}

/**
 * POST handler for:
 *  - saving orders (default)
 *  - action=update  (update order - uses body.action = "update")
 *  - action=delete  (delete order - uses body.action = "delete")
 */
function doPost(e) {
  try {
    const params = e.parameters || {};
    const body = {};
    for (let k in params) {
      body[k] = params[k][0];
    }
    const action = (body.action || "").toString().trim().toLowerCase();

    if (action === "update") return jsonOutput(updateOrder(body));
    if (action === "delete") return jsonOutput(deleteOrder(body.orderId));

    // Default: save order
    body.unitPrice = Number(body.unitPrice || 0);
    body.quantity = Number(body.quantity || 0);
    body.extraAmount = Number(body.extraAmount || 0);
    body.totalAmount = Number(body.totalAmount || (body.unitPrice * body.quantity + body.extraAmount));

    const orderId = saveOrder(body);
    return jsonOutput({ status: "success", orderId });
  } catch (err) {
    return jsonOutput({ status: "error", message: err.toString() });
  }
}

/* --------- Helpers --------- */

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function ensureOrdersHeader(sheet) {
  // Standard header used across code
  const header = ["OrderID","Timestamp","ProductID","ProductTitle","UnitPrice","Quantity","ExtraAmount","TotalAmount","CustomerName","Phone","Address","PinCode","Place","Status"];
  sheet.getRange(1,1,1,header.length).setValues([header]);
}

/* ---- Products ---- */
function getProducts() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(PRODUCTS_SHEET);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  const header = values.shift();
  const idx = {};
  header.forEach((h,i) => {
    idx[h.toString().trim().toLowerCase().replace(/\s+/g,'')] = i;
  });
  return values.map(r => ({
    id: r[idx["id"]] || "",
    title: r[idx["title"]] || "",
    description: r[idx["description"]] || "",
    price: Number(r[idx["price"]] || 0),
    imageUrl: r[idx["imageurl"]] || ""
  }));
}

/* ---- Orders ---- */
function saveOrder(order) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(ORDERS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ORDERS_SHEET);
    ensureOrdersHeader(sheet);
  }
  const orderId = Utilities.getUuid();
  const row = [
    orderId,
    new Date(),
    order.productId || "",
    order.productTitle || "",
    order.unitPrice || 0,
    order.quantity || 0,
    order.extraAmount || 0,
    order.totalAmount || 0,
    order.customerName || "",
    order.phone || "",
    order.address || "",
    order.pin || order.pinCode || "",   // saved to PinCode column
    order.place || "",
    "NEW"
  ];
  sheet.appendRow(row);
  return orderId;
}

function getAllOrders() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(ORDERS_SHEET);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const header = data.shift().map(h => h.toString().trim());
  const results = data.map(r => {
    const obj = {};
    header.forEach((h,i) => obj[h] = r[i]);
    return obj;
  });
  return results;
}

function getOrdersByPhone(phone) {
  const normalized = String(phone).trim();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(ORDERS_SHEET);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const header = data.shift().map(h => h.toString().trim());
  const idxPhone = header.findIndex(h => h.toLowerCase() === "phone");
  if (idxPhone < 0) return [];
  // Compare as string, trimmed
  const matches = data.filter(r => String(r[idxPhone] || "").trim() === normalized);
  return matches.map(r => {
    const obj = {};
    header.forEach((h,i) => obj[h] = r[i]);
    return obj;
  });
}

function updateOrder(body) {
  // currently supports updating Status (and other fields if passed)
  const orderId = body.orderId;
  if (!orderId) return { status: "error", message: "orderId required" };
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(ORDERS_SHEET);
  if (!sheet) return { status: "error", message: "Orders sheet not found" };
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { status: "error", message: "No orders" };
  const header = data[0].map(h => h.toString().trim());
  const colIndex = {};
  header.forEach((h,i) => colIndex[h] = i);

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(orderId)) {
      // update specific columns if passed
      if (body.status && colIndex["Status"] !== undefined) sheet.getRange(i+1, colIndex["Status"]+1).setValue(body.status);
      if (body.phone && colIndex["Phone"] !== undefined) sheet.getRange(i+1, colIndex["Phone"]+1).setValue(body.phone);
      if (body.address && colIndex["Address"] !== undefined) sheet.getRange(i+1, colIndex["Address"]+1).setValue(body.address);
      if (body.pin && colIndex["PinCode"] !== undefined) sheet.getRange(i+1, colIndex["PinCode"]+1).setValue(body.pin);
      if (body.place && colIndex["Place"] !== undefined) sheet.getRange(i+1, colIndex["Place"]+1).setValue(body.place);
      // you can expand updates as needed
      return { status: "success", message: "Order updated" };
    }
  }
  return { status: "error", message: "Order not found" };
}

function deleteOrder(orderId) {
  if (!orderId) return { status: "error", message: "orderId required" };
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(ORDERS_SHEET);
  if (!sheet) return { status: "error", message: "Orders sheet not found" };
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(orderId)) {
      sheet.deleteRow(i+1); // +1 because header row present
      return { status: "success", message: "Order deleted" };
    }
  }
  return { status: "error", message: "Order not found" };
}
