// Standalone harness for the public Wrapper v2 1.0.0 device_info.rs and its own
// unit tests. Only the ApiError fields those tests read are stubbed; nothing
// here touches Apple libraries, an APK, a session or credentials.
#![allow(dead_code)]

mod error {
    #[derive(Debug)]
    pub struct ApiError {
        pub code: String,
    }

    impl ApiError {
        pub fn bad_config(name: &str) -> Self {
            Self { code: name.to_owned() }
        }
    }
}

// The check script copies this harness beside the upstream file.
#[path = "device_info.rs"]
mod device_info;

fn main() {}
