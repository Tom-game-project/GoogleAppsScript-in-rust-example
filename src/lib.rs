mod bindings;

use bindings::Guest;
use wit_bindgen::rt::string::String as WitString;

struct Component;
impl Guest for Component {
    fn scream(input: WitString) -> WitString {
        let mut s = input.to_uppercase();
        s.push_str("!!1!");
        s.into()
    }
}

bindings::export!(Component with_types_in bindings);
