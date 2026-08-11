/**
 * Plain, dependency-free validation. Returns an array of error strings -
 * empty array means valid. Kept as one small function instead of a
 * validation library/schema system since the rules here are simple.
 */
export function validateOrderRequest(body) {
  const errors = [];

  if (!body || typeof body !== 'object') {
    return ['Request body must be a JSON object'];
  }

  if (!body.customer || typeof body.customer !== 'object') {
    errors.push('customer is required');
  } else {
    if (!body.customer.name) errors.push('customer.name is required');
    if (!body.customer.email) errors.push('customer.email is required');
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push('items must be a non-empty array');
  } else {
    body.items.forEach((item, i) => {
      if (!item.productId) errors.push(`items[${i}].productId is required`);
      if (typeof item.quantity !== 'number' || item.quantity <= 0) {
        errors.push(`items[${i}].quantity must be a positive number`);
      }
      if (typeof item.price !== 'number' || item.price < 0) {
        errors.push(`items[${i}].price must be a non-negative number`);
      }
    });
  }

  return errors;
}
