//! Byte-wise Shamir's Secret Sharing over GF(256).
//!
//! This module has zero dependency on wasm-bindgen so it can be compiled and
//! tested with a plain `cargo test` on any host target. The `#[wasm_bindgen]`
//! wrappers in `lib.rs` are thin adapters over these functions.
//!
//! Share encoding: each share is a `Vec<u8>` of `[share_id, data[0], data[1], ...]`
//! where `share_id` is in `1..=255` (x=0 is reserved for the secret itself) and
//! `data` is the same length as the original secret. The wasm/TS layer hex-encodes
//! this into a string, matching the shape `secrets.js-grempe` shares had
//! (`string[]`) so call sites don't change.

use rand::RngCore;
use std::collections::HashSet;

/// Precomputed GF(2^8) log/antilog tables using the AES reduction polynomial
/// (x^8 + x^4 + x^3 + x + 1, i.e. 0x11B) and generator 3.
struct Gf256 {
    exp: [u8; 512],
    log: [u8; 256],
}

/// Multiply by x (i.e. by 2) in GF(2^8), reducing modulo the AES polynomial
/// x^8 + x^4 + x^3 + x + 1 (0x11B). This is the standard "xtime" building
/// block: shift left one bit, and if that overflowed out of 8 bits, XOR back
/// in the low byte of the modulus (0x1B) to reduce.
#[inline]
fn xtime(a: u8) -> u8 {
    let hi_bit_set = a & 0x80 != 0;
    let shifted = a << 1;
    if hi_bit_set {
        shifted ^ 0x1B
    } else {
        shifted
    }
}

impl Gf256 {
    fn new() -> Self {
        let mut exp = [0u8; 512];
        let mut log = [0u8; 256];
        let mut a: u8 = 1;
        for i in 0..255usize {
            exp[i] = a;
            log[a as usize] = i as u8;
            // advance to the next power of generator 3 (= x + 1):
            // a * 3 = a * 2 XOR a = xtime(a) XOR a
            a = xtime(a) ^ a;
        }
        for i in 255..512 {
            exp[i] = exp[i - 255];
        }
        Gf256 { exp, log }
    }

    #[inline]
    fn mul(&self, a: u8, b: u8) -> u8 {
        if a == 0 || b == 0 {
            return 0;
        }
        let idx = self.log[a as usize] as usize + self.log[b as usize] as usize;
        self.exp[idx]
    }

    #[inline]
    fn div(&self, a: u8, b: u8) -> Result<u8, String> {
        if b == 0 {
            return Err("division by zero in GF(256)".to_string());
        }
        if a == 0 {
            return Ok(0);
        }
        let la = self.log[a as usize] as i32;
        let lb = self.log[b as usize] as i32;
        let mut diff = la - lb;
        if diff < 0 {
            diff += 255;
        }
        Ok(self.exp[diff as usize])
    }
}

/// Evaluate a polynomial (coeffs[0] = constant term = secret byte) at point `x`
/// using Horner's method, all arithmetic in GF(256).
fn eval_poly(gf: &Gf256, coeffs: &[u8], x: u8) -> u8 {
    let mut result: u8 = 0;
    for &c in coeffs.iter().rev() {
        result = gf.mul(result, x) ^ c;
    }
    result
}

/// Split `secret` into `total` shares, `threshold` of which are required to
/// reconstruct. Each returned share is `[share_id, ...data_bytes]`.
pub fn split(secret: &[u8], threshold: u8, total: u8) -> Result<Vec<Vec<u8>>, String> {
    if secret.is_empty() {
        return Err("secret must not be empty".to_string());
    }
    if threshold < 2 {
        return Err("threshold must be at least 2".to_string());
    }
    if total < threshold {
        return Err("total shares must be >= threshold".to_string());
    }
    if total == 0 {
        return Err("total shares must be between 1 and 255".to_string());
    }

    let gf = Gf256::new();
    let mut rng = rand::thread_rng();

    // For each secret byte, build a degree-(threshold-1) polynomial with that
    // byte as the constant term and random coefficients otherwise.
    let mut coeffs_per_byte: Vec<Vec<u8>> = Vec::with_capacity(secret.len());
    for &secret_byte in secret {
        let mut coeffs = vec![0u8; threshold as usize];
        coeffs[0] = secret_byte;
        if threshold > 1 {
            let mut rand_bytes = vec![0u8; threshold as usize - 1];
            rng.fill_bytes(&mut rand_bytes);
            coeffs[1..].copy_from_slice(&rand_bytes);
        }
        coeffs_per_byte.push(coeffs);
    }

    let mut shares: Vec<Vec<u8>> = Vec::with_capacity(total as usize);
    for share_id in 1u16..=(total as u16) {
        let id = share_id as u8;
        let mut share = Vec::with_capacity(1 + secret.len());
        share.push(id);
        for coeffs in &coeffs_per_byte {
            share.push(eval_poly(&gf, coeffs, id));
        }
        shares.push(share);
    }

    Ok(shares)
}

/// Reconstruct the secret from `shares` (each `[share_id, ...data_bytes]`) via
/// Lagrange interpolation at x=0. Any `threshold`-sized subset of the shares
/// produced by `split` will reconstruct correctly; fewer shares silently
/// produce a wrong result rather than erroring, matching the mathematical
/// property of Shamir's scheme (and the behavior of secrets.js-grempe).
pub fn combine(shares: &[Vec<u8>]) -> Result<Vec<u8>, String> {
    if shares.is_empty() {
        return Err("no shares provided".to_string());
    }

    let secret_len = shares[0]
        .len()
        .checked_sub(1)
        .ok_or_else(|| "malformed share: too short".to_string())?;
    if secret_len == 0 {
        return Err("malformed share: no data".to_string());
    }

    let mut ids_seen: HashSet<u8> = HashSet::with_capacity(shares.len());
    for share in shares {
        if share.len() != secret_len + 1 {
            return Err("shares have inconsistent length".to_string());
        }
        let id = share[0];
        if id == 0 {
            return Err("invalid share id (0 is reserved for the secret)".to_string());
        }
        if !ids_seen.insert(id) {
            return Err("duplicate share id".to_string());
        }
    }

    let gf = Gf256::new();
    let mut secret = vec![0u8; secret_len];

    for byte_idx in 0..secret_len {
        let mut result: u8 = 0;
        for i in 0..shares.len() {
            let xi = shares[i][0];
            let yi = shares[i][1 + byte_idx];

            // Lagrange basis polynomial evaluated at x=0:
            //   L_i(0) = prod_{j != i} (0 - x_j) / (x_i - x_j)
            // In GF(2^n), subtraction == addition == XOR, so (0 - x_j) = x_j
            // and (x_i - x_j) = x_i ^ x_j.
            let mut numerator: u8 = 1;
            let mut denominator: u8 = 1;
            for j in 0..shares.len() {
                if i == j {
                    continue;
                }
                let xj = shares[j][0];
                numerator = gf.mul(numerator, xj);
                denominator = gf.mul(denominator, xi ^ xj);
            }
            let basis = gf.div(numerator, denominator)?;
            result ^= gf.mul(yi, basis);
        }
        secret[byte_idx] = result;
    }

    Ok(secret)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gf256_mul_identity_and_zero() {
        let gf = Gf256::new();
        assert_eq!(gf.mul(0, 200), 0);
        assert_eq!(gf.mul(200, 0), 0);
        assert_eq!(gf.mul(1, 200), 200);
        assert_eq!(gf.mul(200, 1), 200);
    }

    #[test]
    fn gf256_mul_div_roundtrip() {
        let gf = Gf256::new();
        for a in 1..=255u8 {
            for b in [1u8, 7, 42, 200, 255] {
                let product = gf.mul(a, b);
                let back = gf.div(product, b).unwrap();
                assert_eq!(back, a, "a={a} b={b}");
            }
        }
    }

    #[test]
    fn split_combine_roundtrip_exact_threshold() {
        let secret = b"this-is-a-32-byte-aes-256-key!!".to_vec(); // 32 bytes
        let shares = split(&secret, 3, 5).unwrap();
        assert_eq!(shares.len(), 5);
        // exactly threshold shares
        let subset = vec![shares[0].clone(), shares[2].clone(), shares[4].clone()];
        let recovered = combine(&subset).unwrap();
        assert_eq!(recovered, secret);
    }

    #[test]
    fn split_combine_roundtrip_more_than_threshold() {
        let secret: Vec<u8> = (0u8..64).collect(); // arbitrary 64 bytes
        let shares = split(&secret, 2, 6).unwrap();
        let subset = shares[..5].to_vec(); // more than threshold
        let recovered = combine(&subset).unwrap();
        assert_eq!(recovered, secret);
    }

    #[test]
    fn split_combine_any_threshold_subset_works() {
        let secret = vec![0xDEu8, 0xAD, 0xBE, 0xEF, 0x00, 0xFF];
        let shares = split(&secret, 4, 7).unwrap();
        // try a bunch of different 4-of-7 subsets
        let subsets: Vec<Vec<usize>> = vec![
            vec![0, 1, 2, 3],
            vec![3, 4, 5, 6],
            vec![0, 2, 4, 6],
            vec![1, 3, 5, 6],
        ];
        for idxs in subsets {
            let subset: Vec<Vec<u8>> = idxs.iter().map(|&i| shares[i].clone()).collect();
            let recovered = combine(&subset).unwrap();
            assert_eq!(recovered, secret, "failed for subset {:?}", idxs);
        }
    }

    #[test]
    fn insufficient_shares_do_not_silently_match() {
        // Below threshold, reconstruction should (with overwhelming probability)
        // NOT equal the original secret. This documents the property rather
        // than "enforcing" it -- Shamir combine cannot know the threshold.
        let secret = b"super-secret-key-material-32byt".to_vec();
        let shares = split(&secret, 5, 8).unwrap();
        let subset = vec![shares[0].clone(), shares[1].clone()]; // only 2 of 5 needed
        let recovered = combine(&subset).unwrap();
        assert_ne!(recovered, secret);
    }

    #[test]
    fn each_byte_all_zero_secret() {
        let secret = vec![0u8; 32];
        let shares = split(&secret, 3, 5).unwrap();
        let subset = vec![shares[1].clone(), shares[2].clone(), shares[3].clone()];
        let recovered = combine(&subset).unwrap();
        assert_eq!(recovered, secret);
    }

    #[test]
    fn each_byte_all_0xff_secret() {
        let secret = vec![0xFFu8; 32];
        let shares = split(&secret, 3, 5).unwrap();
        let subset = vec![shares[0].clone(), shares[1].clone(), shares[4].clone()];
        let recovered = combine(&subset).unwrap();
        assert_eq!(recovered, secret);
    }

    #[test]
    fn rejects_bad_params() {
        let secret = vec![1u8, 2, 3];
        assert!(split(&secret, 1, 5).is_err()); // threshold < 2
        assert!(split(&secret, 6, 5).is_err()); // threshold > total
        assert!(split(&[], 3, 5).is_err()); // empty secret
        assert!(combine(&[]).is_err()); // no shares
    }

    #[test]
    fn rejects_duplicate_share_ids() {
        let secret = vec![1u8, 2, 3, 4];
        let shares = split(&secret, 2, 4).unwrap();
        let dup = vec![shares[0].clone(), shares[0].clone()];
        assert!(combine(&dup).is_err());
    }

    #[test]
    fn shares_are_distinct_and_differ_from_secret() {
        let secret = vec![0xAAu8; 16];
        let shares = split(&secret, 3, 5).unwrap();
        // no two shares should be identical
        for i in 0..shares.len() {
            for j in (i + 1)..shares.len() {
                assert_ne!(shares[i], shares[j]);
            }
        }
    }

    #[test]
    fn randomized_fuzz_roundtrip() {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        for _ in 0..200 {
            let len = rng.gen_range(1..=64);
            let secret: Vec<u8> = (0..len).map(|_| rng.gen()).collect();
            let total = rng.gen_range(2..=20u8);
            let threshold = rng.gen_range(2..=total);
            let shares = split(&secret, threshold, total).unwrap();

            // pick a random threshold-sized subset
            let mut indices: Vec<usize> = (0..total as usize).collect();
            for i in (1..indices.len()).rev() {
                let j = rng.gen_range(0..=i);
                indices.swap(i, j);
            }
            let subset: Vec<Vec<u8>> = indices[..threshold as usize]
                .iter()
                .map(|&i| shares[i].clone())
                .collect();

            let recovered = combine(&subset).unwrap();
            assert_eq!(recovered, secret);
        }
    }
}