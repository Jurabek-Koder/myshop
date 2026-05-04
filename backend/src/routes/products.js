import { supabase } from '../config/supabase.js';

// GET products
export const getProducts = async (req, res) => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('approved', true);

  if (error) return res.status(500).json(error);

  res.json(data);
};

// ADD product
export const addProduct = async (req, res) => {
  const { name, price, image } = req.body;

  const { data, error } = await supabase
    .from('products')
    .insert([{ name, price, image }]);

  if (error) return res.status(500).json(error);

  res.json(data);
};
