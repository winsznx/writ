pragma circom 2.1.0;

// STEP 0 probe: prove knowledge of private x such that x*x == public y.
// Used only to validate the snarkjs -> arkworks Groth16-BN254 serialization seam.
template Square() {
    signal input x;       // private witness
    signal input y;       // public input
    x * x === y;
}

component main {public [y]} = Square();
