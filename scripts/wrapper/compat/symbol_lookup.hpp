#pragma once
#include <array>
#include <dlfcn.h>

namespace worker {
// Keep these handles for the worker's lifetime, like the original dlopen calls.
// Explicit handles search only their dependency trees. RTLD_DEFAULT also visits
// the host kernel's vDSO, which can lack the SysV hash expected by Android API 22.
inline std::array<void*, 6> native_symbol_handles{};

inline bool load_symbol_scope(const char* library) {
    for (auto& handle : native_symbol_handles) {
        if (handle == nullptr) {
            handle = dlopen(library, RTLD_NOW | RTLD_GLOBAL);
            return handle != nullptr;
        }
    }
    return false;
}

inline void* lookup_native_symbol(const char* name) {
    for (void* handle : native_symbol_handles) {
        if (handle != nullptr) {
            if (void* symbol = dlsym(handle, name)) return symbol;
        }
    }
    return nullptr;
}
} // namespace worker
