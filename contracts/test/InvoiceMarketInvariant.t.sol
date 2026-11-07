// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {MockUSDC, UsdcTestBase} from "./utils/MockUSDC.sol";
import {InvoiceMarket} from "../src/InvoiceMarket.sol";
import {Invoice, Status} from "../src/interfaces/IInvoiceMarket.sol";

// Stateful invariant test: a handler drives random sequences of calls, and these properties must hold after every call.
// Every payment is the USDC token (6 decimals); amounts are USDC base units.
contract MarketHandler is TestBase {
    InvoiceMarket public immutable market;
    MockUSDC public immutable usdc;
    address public constant SUPPLIER = address(0xD00D);
    address public constant BUYER_VAULT = address(0xBA11);

    address[] public holders;
    uint256[] public ids;
    mapping(uint256 => uint8) internal lastStatus;

    bool public illegalTransition; // set if any invoice ever makes a move outside the allowed state machine
    uint256 public totalFundedIn; // sum of prices paid to fund invoices (all forwarded to suppliers)
    uint256 public totalRepaidIn; // sum of face amounts the buyer vault paid in
    uint256 public totalClaimedOut; // sum of what holders actually received from claim()
    uint256 public calls;

    constructor(InvoiceMarket m, MockUSDC token) {
        market = m;
        usdc = token;
        holders.push(address(0x1AAE));
        holders.push(address(0x2BBE));
        holders.push(address(0x3CCE));
    }

    function holderCount() external view returns (uint256) {
        return holders.length;
    }

    function idCount() external view returns (uint256) {
        return ids.length;
    }

    function _pick(uint256 seed) internal view returns (bool ok, uint256 id) {
        if (ids.length == 0) return (false, 0);
        return (true, ids[seed % ids.length]);
    }

    // Pending -> Open -> Funded -> (Paid | Late), Late -> (Paid | Defaulted). Paid and Defaulted are terminal.
    // The enum is not ordered by progress (Paid = 3 < Late = 4), so this is an explicit transition table, not a comparison.
    function _allowed(uint8 from, uint8 to) internal pure returns (bool) {
        if (from == to) return true;
        if (from == uint8(Status.Pending)) return to == uint8(Status.Open);
        if (from == uint8(Status.Open)) return to == uint8(Status.Funded);
        if (from == uint8(Status.Funded)) return to == uint8(Status.Paid) || to == uint8(Status.Late);
        if (from == uint8(Status.Late)) return to == uint8(Status.Paid) || to == uint8(Status.Defaulted);
        return false; // Paid and Defaulted never change
    }

    function _track() internal {
        calls++;
        for (uint256 i = 0; i < ids.length; i++) {
            uint8 s = uint8(market.getInvoice(ids[i]).status);
            if (!_allowed(lastStatus[ids[i]], s)) illegalTransition = true;
            lastStatus[ids[i]] = s;
        }
    }

    function create(uint256 faceSeed, uint256 discountSeed, uint256 daysSeed) external {
        uint256 face = bound(faceSeed, 1e8, 1e14);
        uint256 price = face - (face * bound(discountSeed, 0, 9000)) / 10000;
        uint64 due = uint64(block.timestamp + bound(daysSeed, 1, 20) * 1 days);
        vm.prank(SUPPLIER);
        try market.createInvoice(BUYER_VAULT, face, price, due, keccak256(abi.encode(ids.length, faceSeed))) returns (uint256 id) {
            ids.push(id);
        } catch {}
        _track();
    }

    function accept(uint256 seed) external {
        (bool ok, uint256 id) = _pick(seed);
        if (ok) {
            vm.prank(BUYER_VAULT);
            try market.acceptInvoice(id) {} catch {}
        }
        _track();
    }

    function fund(uint256 seed, uint256 holderSeed) external {
        (bool ok, uint256 id) = _pick(seed);
        if (ok) {
            address holder = holders[holderSeed % holders.length];
            uint256 price = market.getInvoice(id).price;
            usdc.mint(holder, price);
            vm.prank(holder);
            usdc.approve(address(market), type(uint256).max);
            vm.prank(holder);
            try market.fund(id) {
                totalFundedIn += price;
            } catch {}
        }
        _track();
    }

    function repay(uint256 seed) external {
        (bool ok, uint256 id) = _pick(seed);
        if (ok) {
            uint256 face = market.getInvoice(id).faceAmount;
            usdc.mint(BUYER_VAULT, face);
            vm.prank(BUYER_VAULT);
            usdc.approve(address(market), type(uint256).max);
            vm.prank(BUYER_VAULT);
            try market.payInvoice(id) {
                totalRepaidIn += face;
            } catch {}
        }
        _track();
    }

    function claim(uint256 holderSeed) external {
        address holder = holders[holderSeed % holders.length];
        uint256 before_ = usdc.balanceOf(holder);
        vm.prank(holder);
        try market.claim() {
            totalClaimedOut += usdc.balanceOf(holder) - before_;
        } catch {}
        _track();
    }

    function warpDays(uint256 daysSeed) external {
        vm.warp(block.timestamp + bound(daysSeed, 1, 25) * 1 days);
        _track();
    }

    function markLate(uint256 seed) external {
        (bool ok, uint256 id) = _pick(seed);
        if (ok) {
            try market.markLate(id) {} catch {}
        }
        _track();
    }

    function markDefaulted(uint256 seed) external {
        (bool ok, uint256 id) = _pick(seed);
        if (ok) {
            try market.markDefaulted(id) {} catch {}
        }
        _track();
    }
}

contract InvoiceMarketInvariantTest is UsdcTestBase {
    InvoiceMarket internal market;
    MarketHandler internal handler;

    struct FuzzSelector {
        address addr;
        bytes4[] selectors;
    }

    function setUp() public {
        vm.warp(1_800_000_000);
        market = new InvoiceMarket(1 days, address(usdc));
        handler = new MarketHandler(market, usdc);
    }

    // Foundry reads these to know what to call (the handler, and only its action functions).
    function targetContracts() public view returns (address[] memory targets) {
        targets = new address[](1);
        targets[0] = address(handler);
    }

    function targetSelectors() public view returns (FuzzSelector[] memory selectors) {
        bytes4[] memory sel = new bytes4[](8);
        sel[0] = MarketHandler.create.selector;
        sel[1] = MarketHandler.accept.selector;
        sel[2] = MarketHandler.fund.selector;
        sel[3] = MarketHandler.repay.selector;
        sel[4] = MarketHandler.claim.selector;
        sel[5] = MarketHandler.warpDays.selector;
        sel[6] = MarketHandler.markLate.selector;
        sel[7] = MarketHandler.markDefaulted.selector;
        selectors = new FuzzSelector[](1);
        selectors[0] = FuzzSelector({addr: address(handler), selectors: sel});
    }

    function _totalClaimable() internal view returns (uint256 sum) {
        for (uint256 i = 0; i < handler.holderCount(); i++) {
            sum += market.claimable(handler.holders(i));
        }
    }

    // The market holds exactly what holders can still claim: repayments in, minus claims out.
    function invariant_market_balance_equals_what_holders_can_claim() public view {
        assertEq(usdc.balanceOf(address(market)), _totalClaimable(), "balance == total claimable");
    }

    function invariant_money_in_equals_money_out_plus_held() public view {
        assertEq(handler.totalRepaidIn(), handler.totalClaimedOut() + usdc.balanceOf(address(market)), "repaid == claimed + held");
    }

    // Funding forwards the whole price to the supplier at once, so the market never holds funding money.
    function invariant_suppliers_received_exactly_the_funded_prices() public view {
        assertEq(usdc.balanceOf(handler.SUPPLIER()), handler.totalFundedIn(), "supplier balance == sum of funded prices");
    }

    function invariant_invoices_only_make_allowed_status_transitions() public view {
        assertTrue(!handler.illegalTransition(), "only Pending>Open>Funded>(Paid|Late), Late>(Paid|Defaulted)");
    }

    function invariant_every_invoice_keeps_its_terms_and_a_valid_status() public view {
        for (uint256 i = 0; i < handler.idCount(); i++) {
            Invoice memory inv = market.getInvoice(handler.ids(i));
            assertTrue(inv.id == handler.ids(i), "id matches");
            assertTrue(inv.supplier == handler.SUPPLIER(), "supplier unchanged");
            assertTrue(inv.price <= inv.faceAmount && inv.price > 0, "price within (0, face]");
            assertTrue(uint8(inv.status) <= uint8(Status.Defaulted), "valid status");
            assertTrue((inv.status == Status.Pending || inv.status == Status.Open) == (inv.holder == address(0)), "a holder exists exactly after funding");
        }
    }
}
