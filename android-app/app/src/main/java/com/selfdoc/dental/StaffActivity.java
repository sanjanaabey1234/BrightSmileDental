package com.selfdoc.dental;

/** The SELF DOC staff app: the same screen, opened on the live staff dashboard. */
public class StaffActivity extends MainActivity {
    @Override
    protected String startPath() {
        return "/admin";
    }
}
