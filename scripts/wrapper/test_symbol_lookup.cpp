// Standalone public-code test with fake loader functions. No wrapper or APK.
#include <cassert>
#include <cstring>
#include <dlfcn.h>

static int slots[6];
static int value = 42;
static unsigned opened = 0, attempts = 0, lookups = 0;

static void* fake_open(const char* name, int flags) {
    assert(flags == (RTLD_NOW | RTLD_GLOBAL));
    ++attempts;
    if (name && std::strcmp(name, "fail") == 0) return nullptr;
    assert(opened < 6);
    return &slots[opened++];
}
static void* fake_lookup(void* handle, const char* name) {
    // A global lookup would enter the GNU-only vDSO on the affected kernel.
    assert(handle != RTLD_DEFAULT && handle != RTLD_NEXT);
    ++lookups;
    if (handle == &slots[4] && std::strcmp(name, "wanted") == 0) return &value;
    return nullptr;
}
#define dlopen fake_open
#define dlsym fake_lookup
#include "compat/symbol_lookup.hpp"
#undef dlopen
#undef dlsym

int main() {
    assert(worker::lookup_native_symbol("missing") == nullptr);
    assert(lookups == 0);
    assert(worker::load_symbol_scope(nullptr));
    assert(!worker::load_symbol_scope("fail"));
    for (unsigned i = 0; i < 5; ++i) assert(worker::load_symbol_scope("synthetic-library"));
    assert(!worker::load_symbol_scope("extra"));
    assert(opened == 6 && attempts == 7);
    assert(worker::lookup_native_symbol("missing") == nullptr);
    assert(lookups == 6);
    assert(worker::lookup_native_symbol("wanted") == &value);
    assert(lookups == 11);
}
