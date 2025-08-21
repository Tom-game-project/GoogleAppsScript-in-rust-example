mod bindings;

use bindings::Guest;
//use wit_bindgen::rt::string::String as WitString;

use bindings::wasi::logging::logging::log;

struct Component;
impl Guest for Component {
    fn scream(input: String) -> String {
        let mut s = input.to_uppercase();
        s.push_str("!!1!");
        s.into()
    }

    fn say_hello(s: String) 
    {
        log(
            bindings::wasi::logging::logging::Level::Info,
            &String::from("stdout"), 
            &format!("+++ {} +++", &s)
        );
    }
}

bindings::export!(Component with_types_in bindings);
